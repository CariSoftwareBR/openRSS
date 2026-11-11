import { getLocale, getTranslations } from "next-intl/server";
import { getUserSettings } from "@/lib/app-settings";
import { getFrontPage } from "@/lib/front-page";
import { requireUser } from "@/lib/session";
import { FrontView } from "./front-view";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("front") };
}

/** Página inicial: as notícias dos feeds montadas como a capa de um portal. */
export default async function FrontPage() {
  const user = await requireUser();
  const now = new Date();
  const [page, settings, locale] = await Promise.all([getFrontPage(user.id, now), getUserSettings(user.id), getLocale()]);
  return <FrontView page={page} now={now} locale={locale} timezone={settings.timezone} />;
}
