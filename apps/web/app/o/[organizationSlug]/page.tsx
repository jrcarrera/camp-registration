import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PublicCatalogView } from '../../../components/public-catalog';
import { ApiError, getPublicCatalog } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}): Promise<Metadata> {
  try {
    const catalog = await getPublicCatalog((await params).organizationSlug);
    return {
      title: `${catalog.organization.name} | Camp registration`,
      description:
        catalog.organization.tagline ??
        catalog.organization.description ??
        `Explore ${catalog.organization.name} sessions.`,
    };
  } catch {
    return {};
  }
}
export default async function OrganizationCatalogPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  try {
    return <PublicCatalogView catalog={await getPublicCatalog((await params).organizationSlug)} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
