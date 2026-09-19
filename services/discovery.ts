/**
 * Finds Ponds on the local network over mDNS.
 *
 * pond-server already advertises `_pond._tcp.local.` — its own log says "phones
 * on the same LAN can now discover this hub" — and until now nothing consumed
 * it. Typing an address by hand was the only way in.
 *
 * Why this matters more than it looks: Android's resolver does **no mDNS**, so
 * the `<hostname>.local` in a pairing QR cannot be reached there at all. But
 * NsdManager resolves the service itself and hands back numeric addresses, so
 * discovery returns something the phone can actually connect to. It sidesteps
 * the name-resolution problem rather than working around it.
 */

import Zeroconf, { type Service } from 'react-native-zeroconf';

/** The service pond-server registers. */
const SERVICE_TYPE = 'pond';
const PROTOCOL = 'tcp';
const DOMAIN = 'local.';

/** A Pond found on the network, reduced to what the wizard needs. */
export interface DiscoveredPond {
  /** Stable identity: the address and port actually dialled. */
  id: string;
  /** The advertised instance label, e.g. "Pond Hub @ nano". */
  name: string;
  /** A numeric address, never a `.local` name — see the note above. */
  address: string;
  port: number;
  /** Base URL to hand to the api client. */
  url: string;
  /** Server version from the TXT record, when it published one. */
  version?: string;
  /**
   * The machine this resolved from, normalised for comparison — lowercased,
   * with any trailing dot and `.local` removed, e.g. `nano`.
   *
   * Not for dialling: the name it came from is the one Android cannot resolve.
   * It is kept so a pairing QR carrying only that name can be matched to the
   * numeric address discovery found for it. See `findPondByHost`.
   */
  hostname?: string;
}

/** IPv4 only. An IPv6 literal needs bracketing in a URL and buys nothing here. */
function firstIPv4(addresses: string[] | undefined): string | null {
  return addresses?.find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a)) ?? null;
}

/**
 * Reduce a resolved service to a Pond, or null when it cannot be dialled.
 *
 * A service that resolved without a numeric address is dropped rather than
 * shown: its `host` would be a `.local` name, which is precisely what this
 * feature exists to avoid handing to the user.
 */
export function toPond(service: Service): DiscoveredPond | null {
  const address = firstIPv4(service.addresses);
  const port = service.port;
  if (!address || !port || service.txt?.scheme !== 'https') return null;

  const version = typeof service.txt?.v === 'string' ? service.txt.v : undefined;
  return {
    id: `${address}:${port}`,
    name: service.name?.trim() || 'Pond',
    address,
    port,
    url: `https://${address}:${port}`,
    version,
    hostname: normalizeHostname(service.host),
  };
}

/**
 * Reduce a hostname to the machine name both sides agree on.
 *
 * The two sides do not spell the same machine the same way, and the reason is
 * worth writing down because it makes any fuller comparison unreliable.
 *
 * A pairing QR carries whatever the server's own `hostname::get()` returned,
 * plus `.local`. Android does not report the advertised mDNS name at all: it
 * calls `getHostName()`, which is a *reverse DNS* lookup, so it answers with
 * whatever the router calls that address. On this LAN those disagree per device:
 *
 *   Mac     QR `Emmanueyugi4525.bbrouter.local`   reverse DNS `Emmanueyugi4525.bbrouter`
 *   Jetson  QR `nano.local`                       reverse DNS `nano.bbrouter`
 *
 * The Mac happens to agree once `.local` is stripped, because its own hostname
 * already carried the router's domain. The Jetson does not, and no amount of
 * suffix-stripping makes `nano` equal `nano.bbrouter`.
 *
 * What survives both is the first label — the machine's actual name. So that is
 * what is compared, and `findPondByHost` additionally requires the port to
 * match, which is what keeps this from being a loose match on a common name.
 */
function normalizeHostname(host: string | undefined): string | undefined {
  const trimmed = host
    ?.trim()
    .replace(/\.$/, '')
    .split('.')[0];
  return trimmed ? trimmed.toLowerCase() : undefined;
}

/**
 * Collapse duplicate advertisements.
 *
 * One hub can appear several times: mDNS records outlive the process that
 * registered them, so restarting a server leaves ghosts advertising the same
 * address until their TTL expires. Browsing this network turned up six
 * instances for two actual hubs. Keying on address and port means a restart
 * replaces its own entry instead of adding another.
 */
export function dedupe(ponds: DiscoveredPond[]): DiscoveredPond[] {
  const byId = new Map<string, DiscoveredPond>();
  for (const pond of ponds) byId.set(pond.id, pond);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface DiscoveryHandle {
  stop: () => void;
}

/**
 * Start browsing. Calls `onFound` with the full deduplicated list each time it
 * changes, and `onError` for a failure the user should hear about.
 *
 * The returned handle must be stopped: a live browse holds a multicast lock on
 * Android, which costs battery for as long as it is held.
 */
export function startDiscovery(
  onFound: (ponds: DiscoveredPond[]) => void,
  onError: (message: string) => void,
): DiscoveryHandle {
  const zeroconf = new Zeroconf();
  const found: DiscoveredPond[] = [];

  zeroconf.on('resolved', (service: Service) => {
    const pond = toPond(service);
    if (!pond) return;
    found.push(pond);
    onFound(dedupe(found));
  });

  zeroconf.on('error', (e: Error) => {
    onError(e?.message ?? 'Could not search the network.');
  });

  try {
    zeroconf.scan(SERVICE_TYPE, PROTOCOL, DOMAIN);
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Could not start searching.');
  }

  return {
    stop: () => {
      try {
        zeroconf.stop();
      } finally {
        zeroconf.removeDeviceListeners();
      }
    },
  };
}

/**
 * Find the numeric address for a `.local` hostname a pairing QR carried.
 *
 * The QR encodes `host=<hostname>.local` and, since the `ip=` fix, a numeric
 * address alongside it. Two real cases still produce a QR without one: a Pond
 * running a server older than that fix, whose `/system/info` has no
 * `lan_address` at all, and a desktop build packaged before it. On Android both
 * leave a QR whose only address cannot be resolved, so scanning fails with a
 * valid code in hand.
 *
 * Discovery already knows the numeric address of every hub on the network, so
 * this is a lookup rather than new machinery: browse briefly, and take the hub
 * whose advertised hostname *is* the one the QR named. Matching on the hostname
 * and the port together, rather than on the port alone, keeps it from silently
 * pairing with a different hub that happens to share a port.
 *
 * Resolves null if nothing matches before `timeoutMs`, which is the honest
 * answer on a network that filters multicast.
 */
export function findPondByHost(
  host: string,
  port: number,
  timeoutMs = 6_000,
): Promise<DiscoveredPond | null> {
  const wanted = normalizeHostname(host);
  if (!wanted) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    // `startDiscovery` reports a scan that throws synchronously, before it has
    // returned its handle — so the handle is held in a variable that may still
    // be null when `finish` runs, and stopped again once it exists.
    let handle: DiscoveryHandle | null = null;

    const finish = (pond: DiscoveredPond | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handle?.stop();
      resolve(pond);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    handle = startDiscovery(
      (ponds) => {
        const match = ponds.find((p) => p.hostname === wanted && p.port === port);
        if (match) finish(match);
      },
      // A browse that cannot start is a null answer, not a thrown error: the
      // caller's next move is the same either way.
      () => finish(null),
    );

    // If the browse failed on the way out, the handle arrived after `finish`
    // had already run and nothing has released it.
    if (settled) handle.stop();
  });
}
