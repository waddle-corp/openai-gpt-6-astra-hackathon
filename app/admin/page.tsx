import { MerchantOverview } from '@/components/merchant-overview';
import { getStrategyOverview } from '@/lib/admin-overview-data';

export default function AdminPage() {
  return <MerchantOverview {...getStrategyOverview()} />;
}
