/**
 * Devices ViewModel
 * Fetches the smart-home devices registered on the paired Pond desktop.
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/services/api-client';
import { useServer } from '@/providers/server-provider';
import { groupDevicesByRoom, type Device, type Room } from '@/models/device';

interface DevicesState {
  devices: Device[];
  rooms: Room[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDevices(): DevicesState {
  const { online, token } = useServer();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!online || !token) {
      setDevices([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDevices(await api.listDevices());
    } catch (err) {
      setDevices([]);
      setError(
        err instanceof Error ? err.message : 'Could not load devices from the Pond desktop.',
      );
    } finally {
      setLoading(false);
    }
  }, [online, token]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return { devices, rooms: groupDevicesByRoom(devices), loading, error, refetch: fetchDevices };
}
