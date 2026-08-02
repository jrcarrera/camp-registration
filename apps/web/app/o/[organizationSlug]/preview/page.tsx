import { notFound } from 'next/navigation';

import { PublicCatalogView } from '../../../../components/public-catalog';
import { ApiError, getPublicCatalogPreview } from '../../../../lib/api';

export const dynamic = 'force-dynamic';
export default async function OrganizationCatalogPreviewPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  try {
    const catalog = await getPublicCatalogPreview();
    if (catalog.organization.slug !== organizationSlug) notFound();
    return <PublicCatalogView catalog={catalog} preview />;
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) notFound();
    throw error;
  }
}
