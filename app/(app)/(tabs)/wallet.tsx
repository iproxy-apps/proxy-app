import { Wallet as WalletIcon } from 'lucide-react-native'

import { TabPlaceholder } from '../../../src/components/TabPlaceholder'

export default function Wallet() {
  return (
    <TabPlaceholder
      Icon={WalletIcon}
      title="Carteira"
      subtitle="Seus ganhos como Proxy."
      description="Em breve você verá seu saldo, histórico de recebimentos e poderá conectar sua conta pra sacar."
    />
  )
}
