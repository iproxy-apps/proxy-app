import { ClientHome } from '@/feature/home/components/ClientHome'
import { ProxyHome } from '@/feature/home/components/ProxyHome'
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'

export default function Home() {
  const { session } = useProxyAuth()

  if (!session) return null

  if (session.userType === 'CLIENT') {
    return <ClientHome session={session} />
  }
  return <ProxyHome session={session} />
}
