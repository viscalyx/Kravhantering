# HSA Person Lookup Adapter

This test and integration-support image exposes the repository-owned
`POST /hsa/person-records/lookup` REST contract and translates one accepted
request to SOAP `GetHsaPerson`.

The only business listener is HTTPS on `8443`. Startup requires the complete
strict tuple for both legs:

- `HSA_ADAPTER_INGRESS_CERT_PATH`, `HSA_ADAPTER_INGRESS_KEY_PATH`,
  `HSA_ADAPTER_INGRESS_CA_PATH`, and the exact
  `HSA_ADAPTER_INGRESS_EXPECTED_CLIENT_SUBJECT` for Kong-to-Adapter ingress;
- `HSA_SOAP_ENDPOINT_URL`, `HSA_SOAP_CLIENT_CERT_PATH`,
  `HSA_SOAP_CLIENT_KEY_PATH`, `HSA_SOAP_CA_PATH`, and the exact
  `HSA_SOAP_TLS_SERVER_NAME` for Adapter-to-HSA egress.

Each role bundle is provisioned before startup and mounted read-only. The
runtime has no plaintext business listener, optional authentication mode,
certificate generator, CA signing key, live reload, or TLS-validation bypass.
Loopback `127.0.0.1:8081/health` is the separate local health endpoint.

The Adapter forwards the App-generated UUID correlation identifier as the SOAP
message identifier and logs only the identifier and a stable event name. SOAP
payloads and HSA person data are never logged. Invalid requests and upstream
TLS or SOAP failures return bounded REST outcomes without raw diagnostics.

Run the component contract with:

```bash
npm --prefix containers/hsa-person-lookup-adapter test
```

The required deployed topology, negative identity matrix, and rotation tests
live in `containers/hsa-mtls-topology/`.
