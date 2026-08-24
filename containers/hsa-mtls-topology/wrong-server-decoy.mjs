import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const role = process.env.HSA_WRONG_SERVER_ROLE
const required = {
  ca: process.env.HSA_WRONG_SERVER_CLIENT_CA_PATH,
  cert: process.env.HSA_WRONG_SERVER_CERT_PATH,
  key: process.env.HSA_WRONG_SERVER_KEY_PATH,
}
if (!role || Object.values(required).some(value => !value)) {
  throw new Error('Wrong-server decoy configuration is incomplete')
}

const soapResponse = [
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
  '<soap:Body>',
  '<hsa:GetHsaPersonResponse xmlns:hsa="urn:riv:hsa:HsaWsResponder:3">',
  '<hsa:userInformations><hsa:userInformation>',
  '<hsa:hsaIdentity>SE5560000001-marias</hsa:hsaIdentity>',
  '<hsa:givenName>Maria</hsa:givenName>',
  '<hsa:sn>Svensson</hsa:sn>',
  '</hsa:userInformation></hsa:userInformations>',
  '</hsa:GetHsaPersonResponse>',
  '</soap:Body></soap:Envelope>',
].join('')

const tlsServer = https.createServer(
  {
    ca: fs.readFileSync(required.ca),
    cert: fs.readFileSync(required.cert),
    key: fs.readFileSync(required.key),
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    requestCert: true,
  },
  (_request, response) => {
    console.log(
      JSON.stringify({ event: 'hsa_wrong_server_decoy_request', role }),
    )
    if (role === 'adapter-to-hsa') {
      response.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' })
      response.end(soapResponse)
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        givenName: 'Maria',
        hsaId: 'SE5560000001-marias',
        surname: 'Svensson',
      }),
    )
  },
)

tlsServer.on('tlsClientError', () => {
  console.log(
    JSON.stringify({ event: 'hsa_wrong_server_decoy_tls_rejected', role }),
  )
})

tlsServer.on('connection', () => {
  console.log(
    JSON.stringify({ event: 'hsa_wrong_server_decoy_connection', role }),
  )
})

const healthServer = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end('{"status":"ok"}')
})

await Promise.all([
  new Promise((resolve, reject) => {
    tlsServer.once('error', reject)
    tlsServer.listen(8443, '0.0.0.0', resolve)
  }),
  new Promise((resolve, reject) => {
    healthServer.once('error', reject)
    healthServer.listen(8081, '127.0.0.1', resolve)
  }),
])

console.log(JSON.stringify({ event: 'hsa_wrong_server_decoy_ready', role }))
