#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_COMMIT=032ddeeacbac6d32c0247fddbcba25c32b493973
readonly EVIDENCE_ROOT=tmp/ubi-nodejs-24-prototype
readonly DOCKER_CONFIG_ROOT=/tmp/wayfinder-1085-docker-config
readonly GRYPE_CACHE_ROOT=/tmp/wayfinder-1085-grype-cache
readonly GRYPE_IMAGE=anchore/grype:v0.110.0
readonly -a IMAGES=(
  app-runtime
  db-job
  demo-seed
  hsa-directory-mock
  hsa-person-lookup-adapter
  hsa-mtls-provisioner
)

mkdir -p "$DOCKER_CONFIG_ROOT" "$GRYPE_CACHE_ROOT"
rm -rf -- "$EVIDENCE_ROOT"
mkdir -p \
  "$EVIDENCE_ROOT/current" \
  "$EVIDENCE_ROOT/candidate" \
  "$EVIDENCE_ROOT/grype/current" \
  "$EVIDENCE_ROOT/grype/candidate"

export DOCKER_CONFIG="$DOCKER_CONFIG_ROOT"

build_oci() {
  local family="$1" name="$2" dockerfile="$3" target="$4"
  shift 4
  local -a target_arg=()
  [[ -z "$target" ]] || target_arg=(--target "$target")
  local started elapsed
  started="$(date +%s)"
  docker buildx build \
    --file "$dockerfile" \
    "${target_arg[@]}" \
    --platform linux/amd64 \
    --provenance=false \
    --tag "localhost/kravhantering/${name}:${family}-prototype" \
    --output "type=oci,dest=${EVIDENCE_ROOT}/${family}/${name}.oci.tar" \
    "$@" \
    .
  elapsed="$(( $(date +%s) - started ))"
  printf '%s\t%s\t%s\n' "$family" "$name" "$elapsed" \
    >> "$EVIDENCE_ROOT/build-times.tsv"
}

build_family() {
  local family="$1"
  local app_dockerfile hsa_dockerfile provisioner_dockerfile
  if [[ "$family" == current ]]; then
    app_dockerfile=containers/app/Dockerfile
    hsa_dockerfile=
    provisioner_dockerfile=containers/hsa-mtls-provisioner/Dockerfile
  else
    app_dockerfile=prototypes/ubi-nodejs-24/Dockerfile.app
    hsa_dockerfile=prototypes/ubi-nodejs-24/Dockerfile.hsa-service
    provisioner_dockerfile=prototypes/ubi-nodejs-24/Dockerfile.provisioner
  fi

  build_oci "$family" app-runtime "$app_dockerfile" app-runtime \
    --build-arg "BUILD_COMMIT_SHA=$SOURCE_COMMIT" \
    --build-arg BUILD_TIME=2026-09-04T00:00:00.000Z
  build_oci "$family" db-job "$app_dockerfile" db-job
  build_oci "$family" demo-seed "$app_dockerfile" demo-seed

  if [[ "$family" == current ]]; then
    build_oci "$family" hsa-directory-mock \
      containers/hsa-directory-mock/Dockerfile ''
    build_oci "$family" hsa-person-lookup-adapter \
      containers/hsa-person-lookup-adapter/Dockerfile ''
  else
    build_oci "$family" hsa-directory-mock "$hsa_dockerfile" \
      service-with-fixtures \
      --build-arg SERVICE_PATH=containers/hsa-directory-mock
    build_oci "$family" hsa-person-lookup-adapter "$hsa_dockerfile" \
      service-without-fixtures \
      --build-arg SERVICE_PATH=containers/hsa-person-lookup-adapter
  fi
  build_oci "$family" hsa-mtls-provisioner "$provisioner_dockerfile" ''
}

build_family current
build_family candidate

for family in current candidate; do
  for name in "${IMAGES[@]}"; do
    docker load --input "$EVIDENCE_ROOT/$family/$name.oci.tar"
  done
done

probe_image() {
  local family="$1" name="$2" tag="$3" javascript="$4"
  local ref="localhost/kravhantering/${name}:${tag}"
  local expected_identity=1000:1000
  [[ "$name" != hsa-mtls-provisioner ]] || expected_identity=0:0
  docker image inspect "$ref" --format '{{json .Config}}' \
    | jq -c '{User,WorkingDir,Entrypoint,Cmd}'
  docker run --rm --env "EXPECTED_IDENTITY=$expected_identity" \
    --entrypoint sh "$ref" -ec '
    test "$(node --version | cut -d. -f1)" = v24
    test "$(id -u):$(id -g)" = "$EXPECTED_IDENTITY"
    ! command -v npm >/dev/null
    for command in sh find stat getent touch rm dd sleep; do
      command -v "$command" >/dev/null
    done
  '
  if [[ -n "$javascript" ]]; then
    docker run --rm --read-only --tmpfs /tmp:rw,size=64m \
      --entrypoint sh "$ref" -ec 'touch /tmp/allowed; ! touch "$(pwd)/must-fail" 2>/dev/null'
    docker run --rm --read-only --tmpfs /tmp:rw,size=64m \
      --entrypoint node "$ref" -e "$javascript"
  fi
  printf '%s/%s=passed\n' "$family" "$name"
}

for family in current candidate; do
  tag="${family}-prototype"
  probe_image "$family" app-runtime "$tag" \
    'for (const name of ["sharp","mssql","tedious","typeorm"]) require(name)'
  probe_image "$family" db-job "$tag" \
    'for (const name of ["mssql","reflect-metadata","typeorm"]) require(name)'
  probe_image "$family" demo-seed "$tag" \
    'for (const name of ["mssql","reflect-metadata","typeorm"]) require(name)'
  probe_image "$family" hsa-directory-mock "$tag" 'require("saxes")'
  probe_image "$family" hsa-person-lookup-adapter "$tag" 'require("saxes")'
  probe_image "$family" hsa-mtls-provisioner "$tag" ''
done | tee "$EVIDENCE_ROOT/local-contracts.txt"

for family in current candidate; do
  ref="localhost/kravhantering/hsa-mtls-provisioner:${family}-prototype"
  docker run --rm --network none --security-opt no-new-privileges \
    --tmpfs /run/kravhantering/hsa-mtls-issuer:rw,size=64m,mode=0700,nosuid,nodev,noexec \
    --tmpfs /var/lib/kravhantering/hsa-mtls:rw,size=64m,mode=0700,nosuid,nodev \
    --tmpfs /run/kravhantering/hsa-mtls-runtime:rw,size=64m,mode=0700,nosuid,nodev \
    "$ref" ensure
done | tee "$EVIDENCE_ROOT/provisioner-contracts.txt"

readonly HSA_COMPOSE_FILE=containers/hsa-mtls-topology/compose.yml
cleanup_hsa_topology() {
  docker compose -f "$HSA_COMPOSE_FILE" down --volumes --remove-orphans
}
trap cleanup_hsa_topology EXIT
cleanup_hsa_topology
for name in \
  hsa-mtls-provisioner \
  hsa-directory-mock \
  hsa-person-lookup-adapter; do
  docker tag \
    "localhost/kravhantering/${name}:candidate-prototype" \
    "localhost/kravhantering/${name}:topology"
done
docker buildx build \
  --file containers/hsa-mtls-topology/Dockerfile \
  --platform linux/amd64 \
  --tag localhost/kravhantering/hsa-transport-contract-test:topology \
  --load \
  .
hsa_compose=(docker compose -f "$HSA_COMPOSE_FILE")
"${hsa_compose[@]}" run --rm provisioner ensure --lifetime ephemeral
"${hsa_compose[@]}" run --rm provisioner deploy
for service in mock adapter kong; do
  "${hsa_compose[@]}" up --no-build --no-deps -d --wait "$service"
done
"${hsa_compose[@]}" run --rm --no-deps test \
  | tee "$EVIDENCE_ROOT/hsa-topology.txt"
cleanup_hsa_topology
trap - EXIT

oci_layers() {
  local archive="$1" index manifest_digest manifest_path
  index="$(tar -xOf "$archive" index.json)"
  manifest_digest="$(jq -r '.manifests[0].digest' <<< "$index")"
  manifest_path="blobs/sha256/${manifest_digest#sha256:}"
  tar -xOf "$archive" "$manifest_path" \
    | jq -c --arg manifestDigest "$manifest_digest" \
      '{manifestDigest:$manifestDigest,
        compressedBytes:([.layers[].size] | add),
        layers:[.layers[] | {digest,size}]}'
}

: > "$EVIDENCE_ROOT/sizes.jsonl"
for family in current candidate; do
  for name in "${IMAGES[@]}"; do
    oci_layers "$EVIDENCE_ROOT/$family/$name.oci.tar" \
      | jq -c --arg family "$family" --arg name "$name" \
        '. + {family:$family,name:$name}' \
      >> "$EVIDENCE_ROOT/sizes.jsonl"
  done
done

for family in current candidate; do
  jq -s --arg family "$family" '
    [ .[] | select(.family == $family) ] as $images |
    {
      family: $family,
      images: ($images | map({key:.name,value:{manifestDigest,compressedBytes}}) |
        from_entries),
      uniqueSetCompressedBytes:
        ($images | map(.layers[]) | unique_by(.digest) | map(.size) | add)
    }
  ' "$EVIDENCE_ROOT/sizes.jsonl"
done | jq -s 'map({key:.family,value:.}) | from_entries' \
  > "$EVIDENCE_ROOT/sizes.json"

for family in current candidate; do
  for name in "${IMAGES[@]}"; do
    docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v "$GRYPE_CACHE_ROOT:/.cache/grype" \
      "$GRYPE_IMAGE" \
      "localhost/kravhantering/${name}:${family}-prototype" \
      -o json > "$EVIDENCE_ROOT/grype/$family/$name.json"
  done
done

jq -n --arg sourceCommit "$SOURCE_COMMIT" \
  --arg observedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg grypeImage "$GRYPE_IMAGE" \
  '{sourceCommit:$sourceCommit,observedAt:$observedAt,grypeImage:$grypeImage}' \
  > "$EVIDENCE_ROOT/run-metadata.json"

printf 'Prototype evidence written to %s\n' "$EVIDENCE_ROOT"
