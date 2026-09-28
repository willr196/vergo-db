/**
 * Contact details, rates and terms for the client screens, fetched once per
 * app session. Null until loaded or if the request fails; screens render
 * without the extra lines rather than blocking on them.
 */

import { useEffect, useState } from 'react';
import { clientApi, type ClientInfo } from '../../api/clientApi';

let cached: ClientInfo | null = null;

export function useClientInfo(): ClientInfo | null {
  const [info, setInfo] = useState<ClientInfo | null>(cached);

  useEffect(() => {
    if (cached) return;
    let live = true;
    clientApi
      .getInfo()
      .then((result) => {
        cached = result;
        if (live) setInfo(result);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return info;
}
