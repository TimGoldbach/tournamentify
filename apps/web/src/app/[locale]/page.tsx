import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("home");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/${locale}/tournaments/new`}>
          <Button variant="primary">{t("ctaCreate")}</Button>
        </Link>
        <Link href={`/${locale}/dashboard`}>
          <Button variant="ghost">{t("ctaDashboard")}</Button>
        </Link>
      </div>
    </main>
  );
}
