import { getStoryCampaignBattleIds } from "@/story/getStoryCampaignBattleIds";
import { storyCampaignArtwork } from "@/story/storyCampaignArtwork";
import { useState } from "react";
import { StoryCampaignId } from "@aegis/shared/story/StoryCampaignId";
import { storyCatalogCampaigns } from "@aegis/shared/story/storyCatalogCampaigns";
import { useTranslation } from "@/i18n/useTranslation";
import { getTranslatedStoryText } from "@/i18n/getTranslatedStoryText";
import { Button } from "@/design/primitives";

type Params = { completed?: readonly string[]; onSelect: (campaign: string) => void };

const campaigns = [
  { id: StoryCampaignId.LIBERATOR.value, title: "Digimon Liberator", medium: "Manga", isHidden: false },
  ...storyCatalogCampaigns,
].filter((campaign) => !campaign.isHidden && getStoryCampaignBattleIds({ campaignId: campaign.id }).length > 1);

export function StoryCampaignLibrary({ completed, onSelect }: Params) {
  const { locale, t } = useTranslation();
  const text = (value: string) => getTranslatedStoryText({ text: value, locale });
  const [query, setQuery] = useState("");
  const [medium, setMedium] = useState("");
  const featured =
    campaigns.find((campaign) =>
      getStoryCampaignBattleIds({ campaignId: campaign.id }).some((id) => completed?.includes(id)),
    ) ?? campaigns[0]!;
  const featuredBattles = getStoryCampaignBattleIds({ campaignId: featured.id });
  const featuredCompleted = featuredBattles.filter((id) => completed?.includes(id)).length;
  const visible = campaigns.filter(
    (campaign) =>
      (!medium || campaign.medium === medium) &&
      campaign.title.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)),
  );
  return (
    <section className="story-library" aria-labelledby="story-library-heading">
      <header className="story-library__heading">
        <h1 id="story-library-heading">{text("Choose your story")}</h1>
        <p>{text("Relive the greatest battles of the Digimon universe.")}</p>
      </header>
      <section className="story-library__featured" aria-labelledby="story-featured-title">
        <img
          src={
            featured.id === StoryCampaignId.LIBERATOR.value
              ? "https://digimoncard.com/digimon_liberator/images/top/popup/pc/img_climax.jpg?v=260323"
              : storyCampaignArtwork[featured.id]
          }
          alt=""
        />
        <div>
          <span className="story-library__eyebrow">{text("Your next adventure")}</span>
          <h2 id="story-featured-title">{featured.title}</h2>
          <p>
            {completed ? featuredCompleted : "—"} / {featuredBattles.length} {text("Battles completed")}
          </p>
          <progress value={featuredCompleted} max={featuredBattles.length} aria-label={featured.title} />
          <Button onClick={() => onSelect(featured.id)}>{text("Continue campaign")}</Button>
        </div>
      </section>
      <section className="story-library__explanation" aria-labelledby="story-explanation-heading">
        <h2 id="story-explanation-heading">{t("story.explanationTitle")}</h2>
        <p>{t("story.explanationBody")}</p>
      </section>
      <div className="story-library__toolbar">
        <label className="story-library__search">
          <span>{text("Search campaigns")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("Search campaigns")}
          />
        </label>
        <nav className="story-library__filters" aria-label={text("Campaign category")}>
          {["", ...new Set(campaigns.map((campaign) => campaign.medium))].map((value) => (
            <button type="button" key={value} aria-pressed={medium === value} onClick={() => setMedium(value)}>
              {value || text("All campaigns")}
            </button>
          ))}
        </nav>
      </div>
      <p className="story-library__count" role="status">
        {visible.length} {text("Campaigns")}
      </p>
      <div className="story-library__grid">
        {visible.map((campaign) => {
          const battles = getStoryCampaignBattleIds({ campaignId: campaign.id });
          const count = battles.filter((id) => completed?.includes(id)).length;
          return (
            <article key={campaign.id} className="story-library__card">
              <button
                type="button"
                onClick={() => onSelect(campaign.id)}
                aria-label={`${text("Explore campaign")} · ${campaign.title}`}
              >
                <img src={storyCampaignArtwork[campaign.id] ?? storyCampaignArtwork.liberator} alt="" loading="lazy" />
                <div className="story-library__copy">
                  <span className="story-library__medium">{campaign.medium}</span>
                  <h2>{getTranslatedStoryText({ text: campaign.title, locale })}</h2>
                  <p>
                    {completed ? count : "—"} / {battles.length} {text("Battles")}
                  </p>
                  <progress value={count} max={battles.length} aria-label={campaign.title} />
                  <span className="story-library__play" aria-hidden="true">
                    ▶
                  </span>
                </div>
              </button>
            </article>
          );
        })}
      </div>
      {visible.length === 0 && <p>{text("No campaigns found.")}</p>}
    </section>
  );
}
