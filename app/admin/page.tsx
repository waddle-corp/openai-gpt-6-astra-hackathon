import { MerchantOverview } from '@/components/merchant-overview';
import { getAdminOverviewRecords } from '@/lib/admin-overview-data';

export default function AdminPage() {
  return <MerchantOverview records={getAdminOverviewRecords()} />;
}
