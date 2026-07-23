import { useEffect, useState } from 'react'

import { api } from '../api/client'

export function useCurrentUserDid(): string | null {
  const [userDid, setUserDid] = useState<string | null>(null)

  useEffect(() => {
    void api
      .authMe()
      .then((me) => setUserDid(me.user?.did ?? null))
      .catch(() => setUserDid(null))
  }, [])

  return userDid
}
