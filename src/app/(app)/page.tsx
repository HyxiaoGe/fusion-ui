import { redirect } from 'next/navigation';
import { normalizeLegacyNewChatPath } from '@/lib/routes/chatRoutes';

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();
  const model = resolvedSearchParams?.model;

  if (Array.isArray(model)) {
    params.set('model', model[0] ?? '');
  } else if (model) {
    params.set('model', model);
  }

  redirect(normalizeLegacyNewChatPath(params));
}
