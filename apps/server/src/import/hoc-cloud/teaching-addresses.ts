/**
 * IPv4 addresses that imported lessons may keep because they teach something, not because they point at a server.
 * The importer replaces every other address with a placeholder (redact.ts), and `pnpm check:public` accepts these
 * in the lesson folders only (scripts/check-public-info.ts), so the two always agree.
 *
 * Rubric for adding an entry: an address is teaching when it is an operand of the concept being explained (a subnet
 * exercise, a well-known resolver, a container or Pod address inside a demo); it is infrastructure when a command,
 * config value or log line targets the author's own machines (`ssh`, `IP_SERVER=`, `client_ip`, a lab box). Never
 * list infrastructure here, not even to deny it: this file is public.
 */

/** Whether `octets/prefix` has every host bit clear (`10.1.2.0/24`, not `10.1.2.7/24`, which names a host). */
function isNetworkAddress(octets: readonly number[], prefix: number): boolean {
  if (prefix < 0 || prefix > 32) return false;
  const value = octets.reduce((sum, n) => sum * 256 + n, 0);
  const hostBits = 32 - prefix;
  return value % 2 ** hostBits === 0;
}

/** Generic rules, no review needed: these never identify one machine. */
function isGenericTeachingAddress(octets: readonly number[], prefix: number | null): boolean {
  const [a, b, c, d] = octets;
  // What the public-info guard accepts everywhere: loopback, 0.0.x.x, 255.x, documentation ranges, the example
  // home network 192.168.1.0/24.
  if (a === 127 || a === 255 || (a === 0 && b === 0)) return true;
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return true;
  if (a === 192 && b === 168 && c === 1) return true;
  if (prefix !== null && isNetworkAddress(octets, prefix)) return true; // `10.0.0.0/8` names a network, not a host
  if (d === 0 || d === 255) return true; // network and broadcast addresses
  if (a !== undefined && a >= 224) return true; // multicast and reserved
  return a === 169 && b === 254; // link-local, including the cloud metadata address
}

/** Ranges whose every host is a lesson operand, each with its reason. */
const TEACHING_RANGES: ReadonlyArray<readonly [string, string]> = [
  ['10.244.', 'flannel default Pod network: Pod addresses in Kubernetes demos'],
  ['192.168.10.', 'the subnetting exercise splits this /24'],
  ['192.168.81.', 'the DHCP walkthrough network (VMware host-only)'],
  ['172.21.0.', 'Docker Compose network of the network-isolation demo'],
  ['172.22.0.', 'Docker Compose network of the network-isolation demo'],
];

/** Single hosts named by a lesson. */
const TEACHING_HOSTS: ReadonlySet<string> = new Set([
  '1.1.1.1', // public resolver
  '8.8.8.8', // public resolver
  '8.8.4.4', // public resolver
  '93.184.216.34', // example.com in DNS walkthroughs
  '72.14.198.108', // a hop in a traceroute sample
  '10.0.0.1', // DHCP relay and router examples
  '10.0.0.5', // subnetting quiz operand
  '10.0.0.16', // subnetting quiz operand
  '10.0.0.17', // subnetting quiz operand
  '172.20.0.1', // "is this private?" quiz operand
  '192.168.5.128', // subnetting flashcard operand
  '192.168.5.130', // subnetting flashcard operand
  '10.96.0.1', // Kubernetes default `kubernetes` Service address
  '10.96.0.10', // Kubernetes default CoreDNS Service address
  '10.102.109.34', // a ClusterIP in a Service demo (cluster-internal)
  '10.107.187.174', // a ClusterIP in a Service demo (cluster-internal)
  '172.17.0.1', // Docker default bridge gateway
  '172.19.0.2', // a container address in a Compose service-discovery demo
]);

/** Whether a lesson may keep this address; `prefix` is the `/N` written after it, if any. */
export function isTeachingAddress(octets: readonly number[], prefix: number | null = null): boolean {
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (isGenericTeachingAddress(octets, prefix)) return true;
  const address = octets.join('.');
  return TEACHING_HOSTS.has(address) || TEACHING_RANGES.some(([start]) => address.startsWith(start));
}
