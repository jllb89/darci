// Preparation only: emits CloudFormation; never creates AWS resources.
import {pathToFileURL} from 'node:url';
const ref = name => ({Ref: name});
const get = (name, attr) => ({'Fn::GetAtt': [name, attr]});
export function buildFoundation() {
  const Resources = {
    Vpc: {Type: 'AWS::EC2::VPC', Properties: {CidrBlock: '10.60.0.0/16', EnableDnsSupport: true, EnableDnsHostnames: true,
      Tags: [{Key: 'Name', Value: 'darci-production'}, {Key: 'Environment', Value: 'production'}]}},
    Gateway: {Type: 'AWS::EC2::InternetGateway'},
    GatewayAttachment: {Type: 'AWS::EC2::VPCGatewayAttachment', Properties: {VpcId: ref('Vpc'), InternetGatewayId: ref('Gateway')}},
    PublicRoutes: {Type: 'AWS::EC2::RouteTable', Properties: {VpcId: ref('Vpc')}},
    InternetRoute: {Type: 'AWS::EC2::Route', DependsOn: 'GatewayAttachment', Properties: {
      RouteTableId: ref('PublicRoutes'), DestinationCidrBlock: '0.0.0.0/0', GatewayId: ref('Gateway')}},
    Cluster: {Type: 'AWS::ECS::Cluster', Properties: {ClusterName: 'darci-production',
      ClusterSettings: [{Name: 'containerInsights', Value: 'disabled'}], Tags: [{Key: 'Environment', Value: 'production'}]}},
    EdgeSecurity: {Type: 'AWS::EC2::SecurityGroup', Properties: {VpcId: ref('Vpc'), GroupDescription: 'No public ingress until explicit private-candidate access is configured',
      SecurityGroupIngress: [], SecurityGroupEgress: [{IpProtocol: 'tcp', FromPort: 3000, ToPort: 3000, CidrIp: '10.60.0.0/16'},
        {IpProtocol: 'tcp', FromPort: 4000, ToPort: 4000, CidrIp: '10.60.0.0/16'}]}},
    AppSecurity: {Type: 'AWS::EC2::SecurityGroup', Properties: {VpcId: ref('Vpc'), GroupDescription: 'Private API/web/worker tasks; ingress only from the edge',
      SecurityGroupIngress: [3000,4000].map(port => ({IpProtocol: 'tcp', FromPort: port, ToPort: port, SourceSecurityGroupId: ref('EdgeSecurity')})),
      SecurityGroupEgress: [443,5432].map(port => ({IpProtocol: 'tcp', FromPort: port, ToPort: port, CidrIp: '0.0.0.0/0'}))}},
    CacheSecurity: {Type: 'AWS::EC2::SecurityGroup', Properties: {VpcId: ref('Vpc'), GroupDescription: 'TLS cache reachable only by application tasks',
      SecurityGroupIngress: [{IpProtocol: 'tcp', FromPort: 6379, ToPort: 6380, SourceSecurityGroupId: ref('AppSecurity')}],
      // Explicit egress suppresses the default allow-all rule. Cache clients use stateful replies.
      SecurityGroupEgress: [{IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '127.0.0.1/32'}]}},
    AppCacheEgress: {Type: 'AWS::EC2::SecurityGroupEgress', Properties: {GroupId: ref('AppSecurity'), IpProtocol: 'tcp', FromPort: 6379, ToPort: 6380, DestinationSecurityGroupId: ref('CacheSecurity')}},
  };
  for (const [i, zone] of ['A','B'].entries()) {
    Resources[`Public${zone}`] = {Type: 'AWS::EC2::Subnet', Properties: {VpcId: ref('Vpc'), CidrBlock: `10.60.${i}.0/24`, MapPublicIpOnLaunch: false,
      AvailabilityZone: {'Fn::Select': [i, {'Fn::GetAZs': ''}]}}};
    Resources[`Private${zone}`] = {Type: 'AWS::EC2::Subnet', Properties: {VpcId: ref('Vpc'), CidrBlock: `10.60.${i + 10}.0/24`, MapPublicIpOnLaunch: false,
      AvailabilityZone: {'Fn::Select': [i, {'Fn::GetAZs': ''}]}}};
    Resources[`PublicAssociation${zone}`] = {Type: 'AWS::EC2::SubnetRouteTableAssociation', Properties: {SubnetId: ref(`Public${zone}`), RouteTableId: ref('PublicRoutes')}};
    Resources[`NatAddress${zone}`] = {Type: 'AWS::EC2::EIP', DependsOn: 'GatewayAttachment', Properties: {Domain: 'vpc'}};
    Resources[`Nat${zone}`] = {Type: 'AWS::EC2::NatGateway', DependsOn: 'GatewayAttachment', Properties: {SubnetId: ref(`Public${zone}`), AllocationId: get(`NatAddress${zone}`, 'AllocationId')}};
    Resources[`PrivateRoutes${zone}`] = {Type: 'AWS::EC2::RouteTable', Properties: {VpcId: ref('Vpc')}};
    Resources[`PrivateRoute${zone}`] = {Type: 'AWS::EC2::Route', Properties: {RouteTableId: ref(`PrivateRoutes${zone}`), DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: ref(`Nat${zone}`)}};
    Resources[`PrivateAssociation${zone}`] = {Type: 'AWS::EC2::SubnetRouteTableAssociation', Properties: {SubnetId: ref(`Private${zone}`), RouteTableId: ref(`PrivateRoutes${zone}`)}};
  }
  Resources.S3Endpoint = {Type: 'AWS::EC2::VPCEndpoint', Properties: {VpcId: ref('Vpc'), VpcEndpointType: 'Gateway',
    ServiceName: {'Fn::Sub': 'com.amazonaws.${AWS::Region}.s3'}, RouteTableIds: [ref('PrivateRoutesA'), ref('PrivateRoutesB')]}};
  for (const service of ['api','worker','web','recovery']) {
    Resources[`${service}Repository`] = {Type: 'AWS::ECR::Repository', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      RepositoryName: `darci-production-${service}`, ImageTagMutability: 'IMMUTABLE', ImageScanningConfiguration: {ScanOnPush: true},
      EncryptionConfiguration: {EncryptionType: 'AES256'}, Tags: [{Key: 'Environment', Value: 'production'}]}};
    Resources[`${service}Logs`] = {Type: 'AWS::Logs::LogGroup', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      LogGroupName: `/ecs/darci-production-${service}`, RetentionInDays: 30}};
  }
  return {AWSTemplateFormatVersion: '2010-09-09', Description: 'DARCi isolated production foundation. Two billable NAT gateways. No application, DNS, public ingress or live payments.',
    Resources, Outputs: Object.fromEntries(['Vpc','Cluster','PrivateA','PrivateB','EdgeSecurity','AppSecurity','CacheSecurity'].map(name => [name, {Value: ref(name)}]))};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildFoundation(), null, 2));
