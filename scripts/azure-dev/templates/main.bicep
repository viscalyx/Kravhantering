@description('Stable environment id used in ownership tags.')
param environmentId string

@description('Name prefix for generated Azure resources.')
param namePrefix string

@description('Virtual machine name.')
param vmName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Azure VM size.')
param vmSize string

@description('Data disk size in GiB.')
@minValue(64)
param dataDiskGiB int

@description('Linux administrator and SSH user.')
param adminUsername string = 'vscode'

@description('OpenSSH public key installed on the VM.')
param sshPublicKey string

@description('Connectivity mode.')
@allowed([
  'public-ssh'
  'tailscale'
])
param connectivityMode string = 'public-ssh'

@description('Allowed source CIDR for inbound SSH in public-ssh mode.')
param allowedSshCidr string

@description('Enable Azure DevTestLab auto-shutdown.')
param autoStopEnabled bool = true

@description('Auto-shutdown time in HHmm format.')
param autoStopTime string = '2200'

@description('Auto-shutdown time zone id.')
param autoStopTimeZone string = 'UTC'

@description('Ubuntu Marketplace image publisher.')
param imagePublisher string

@description('Ubuntu Marketplace image offer.')
param imageOffer string

@description('Ubuntu Marketplace image SKU.')
param imageSku string

@description('Ubuntu Marketplace image version.')
param imageVersion string

var commonTags = {
  'managed-by': 'kravhantering-azure-dev'
  'environment-id': environmentId
  repository: 'viscalyx/Kravhantering'
  purpose: 'personal-development'
}

var vnetName = '${namePrefix}-vnet'
var subnetName = 'snet-dev'
var nsgName = '${namePrefix}-nsg'
var publicIpName = '${namePrefix}-pip'
var nicName = '${namePrefix}-nic'
var osDiskName = '${vmName}-osdisk'
var dataDiskName = '${vmName}-data'
var sshPublicKeyName = '${namePrefix}-ssh-key'
var autoShutdownName = 'shutdown-computevm-${vmName}'

var sshRules = connectivityMode == 'public-ssh' ? [
  {
    name: 'AllowSshFromOperator'
    properties: {
      priority: 100
      direction: 'Inbound'
      access: 'Allow'
      protocol: 'Tcp'
      sourcePortRange: '*'
      destinationPortRange: '22'
      sourceAddressPrefix: allowedSshCidr
      destinationAddressPrefix: '*'
    }
  }
] : []

var nicIpProperties = union({
  subnet: {
    id: subnet.id
  }
  privateIPAllocationMethod: 'Dynamic'
  privateIPAddressVersion: 'IPv4'
}, connectivityMode == 'public-ssh' ? {
  publicIPAddress: {
    id: publicIp!.id
  }
} : {})

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: vnetName
  location: location
  tags: commonTags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.41.0.0/16'
      ]
    }
    privateEndpointVNetPolicies: 'Disabled'
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: nsgName
  location: location
  tags: commonTags
  properties: {
    securityRules: sshRules
  }
}

resource publicIp 'Microsoft.Network/publicIPAddresses@2024-05-01' = if (connectivityMode == 'public-ssh') {
  name: publicIpName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  tags: commonTags
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

resource subnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: subnetName
  properties: {
    addressPrefix: '10.41.1.0/24'
    privateEndpointNetworkPolicies: 'Disabled'
    networkSecurityGroup: {
      id: nsg.id
    }
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: nicName
  location: location
  tags: commonTags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: nicIpProperties
      }
    ]
  }
}

resource sshKey 'Microsoft.Compute/sshPublicKeys@2024-07-01' = {
  name: sshPublicKeyName
  location: location
  tags: commonTags
  properties: {
    publicKey: sshPublicKey
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: vmName
  location: location
  tags: commonTags
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: imagePublisher
        offer: imageOffer
        sku: imageSku
        version: imageVersion
      }
      osDisk: {
        name: osDiskName
        createOption: 'FromImage'
        deleteOption: 'Delete'
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
      dataDisks: [
        {
          lun: 0
          name: dataDiskName
          createOption: 'Empty'
          caching: 'None'
          deleteOption: 'Delete'
          diskSizeGB: dataDiskGiB
          managedDisk: {
            storageAccountType: 'Premium_LRS'
          }
          toBeDetached: false
        }
      ]
    }
  }
}

resource autoShutdown 'Microsoft.DevTestLab/schedules@2018-09-15' = if (autoStopEnabled) {
  name: autoShutdownName
  location: location
  tags: commonTags
  properties: {
    status: 'Enabled'
    taskType: 'ComputeVmShutdownTask'
    dailyRecurrence: {
      time: autoStopTime
    }
    timeZoneId: autoStopTimeZone
    notificationSettings: {
      status: 'Disabled'
    }
    targetResourceId: vm.id
  }
}

output vmName string = vm.name
output adminUsername string = adminUsername
output publicIpAddress string = connectivityMode == 'public-ssh' ? publicIp!.properties.ipAddress : ''
output networkSecurityGroupName string = nsg.name
output sshPublicKeyResourceName string = sshKey.name
output imageUrn string = '${imagePublisher}:${imageOffer}:${imageSku}:${imageVersion}'
