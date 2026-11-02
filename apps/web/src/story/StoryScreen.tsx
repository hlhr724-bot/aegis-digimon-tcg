import { StoryCampaignLibrary } from "@/story/StoryCampaignLibrary";
import { StoryCampaignId } from "@aegis/shared/story/StoryCampaignId";
import { StoryCatalogScreen } from "@/story/StoryCatalogScreen";
import { storyCatalogCampaigns } from "@aegis/shared/story/storyCatalogCampaigns";
import { getStoryGuestToken } from "@/story/getStoryGuestToken";
import { useEffect, useState } from "react";
import type { StoryProgress } from "@aegis/shared/story/StoryBattle";
import { Button, Eyebrow } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { request } from "@/account/client";
import { useTranslation } from "@/i18n/useTranslation";
import { getTranslatedStoryText } from "@/i18n/getTranslatedStoryText";
import { StoryBattleRow } from "@/story/StoryBattleRow";
import { storyCharacters } from "@/story/storyCharacters";
import { findStoryBattleCampaignId } from "@/story/findStoryBattleCampaignId";
import { useStoryCampaignBattles } from "@/story/useStoryCampaignBattles";
import "@/story/story.css";

type Params = {
  signedIn: boolean;
  onSignIn: () => void;
  onStart: (battleId: string) => void;
  initialBattleId?: string;
};

export function StoryScreen({ signedIn, onSignIn, onStart, initialBattleId }: Params) {
  const { t, locale } = useTranslation();
  const [campaign, setCampaign] = useState<string | undefined>(() =>
    initialBattleId ? findStoryBattleCampaignId({ battleId: initialBattleId }) : undefined,
  );
  const loadedLiberatorBattles = useStoryCampaignBattles({
    campaignId: campaign === StoryCampaignId.LIBERATOR.value ? campaign : undefined,
  });
  const liberatorBattles = loadedLiberatorBattles ?? [];
  const [character, setCharacter] = useState("Shoto Kazama");
  const [progress, setProgress] = useState<StoryProgress>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setProgress(undefined);
    setFailed(false);
    void request<StoryProgress>("/story/progress", { headers: { Authorization: `StoryGuest ${getStoryGuestToken()}` } })
      .then((value) => {
        if (active) {
          setProgress(value);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [signedIn]);
  const loaded = (progress !== undefined || failed) && loadedLiberatorBattles !== undefined;
  const battles = liberatorBattles.filter((battle) => !character || battle.character === character);
  const completed = battles.filter((battle) => progress?.completed.includes(battle.id)).length;
  const totalCompleted = liberatorBattles.filter((battle) => progress?.completed.includes(battle.id)).length;
  return (
    <main className="story-page">
      <div className="story-screen">
        {!campaign && <StoryCampaignLibrary completed={progress?.completed} onSelect={setCampaign} />}
        {campaign && (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={Icons.ArrowLeft}
              className="story-back"
              onClick={() => setCampaign(undefined)}
            >
              {t("story.backToCampaigns")}
            </Button>
            <header className="story-header" data-catalog={campaign !== StoryCampaignId.LIBERATOR.value || undefined}>
              {campaign === StoryCampaignId.LIBERATOR.value && (
                <div className="story-header__art" aria-hidden="true">
                  <img
                    src="https://digimoncard.com/digimon_liberator/images/top/popup/pc/img_climax.jpg?v=260323"
                    alt=""
                  />
                </div>
              )}
              <div className="story-header__copy">
                <Eyebrow>{t("story.title")}</Eyebrow>
                <h1>
                  {getTranslatedStoryText({
                    text:
                      campaign === StoryCampaignId.LIBERATOR.value
                        ? "Digimon Liberator"
                        : (storyCatalogCampaigns.find((entry) => entry.id === campaign)?.title ?? campaign),
                    locale,
                  })}
                </h1>
                <p>{t("story.tagline")}</p>
              </div>
            </header>
          </>
        )}
        {campaign && campaign !== StoryCampaignId.LIBERATOR.value && (
          <StoryCatalogScreen key={campaign} campaignId={campaign} signedIn={signedIn} onStart={onStart} />
        )}
        {campaign === StoryCampaignId.LIBERATOR.value && (
          <>
            <div
              className="story-progress"
              aria-label={t("story.progress", { completed: totalCompleted, total: liberatorBattles.length })}
            >
              <strong>{t("story.progress", { completed: totalCompleted, total: liberatorBattles.length })}</strong>
              <div className="story-progress__segments" aria-hidden="true">
                {liberatorBattles.map((battle) => (
                  <span key={battle.id} data-completed={progress?.completed.includes(battle.id) || undefined} />
                ))}
              </div>
            </div>
            {!signedIn && (
              <div className="story-signin">
                <Icons.BookOpen size={20} />
                <span>{t("story.signin")}</span>
                <Button variant="secondary" onClick={onSignIn}>
                  {t("nav.signIn")}
                </Button>
              </div>
            )}
            <div className="story-workspace">
              <nav className="story-characters" aria-label={t("story.character")}>
                <button type="button" aria-pressed={!character} onClick={() => setCharacter("")}>
                  <span className="story-characters__all">
                    <Icons.Users size={20} />
                  </span>
                  <span>{t("story.all")}</span>
                  <small>{liberatorBattles.length}</small>
                </button>
                {storyCharacters.map((person) => (
                  <button
                    key={person.name}
                    type="button"
                    aria-pressed={character === person.name}
                    onClick={() => setCharacter(person.name)}
                  >
                    <img src={person.portraitUrl} alt="" loading="lazy" />
                    <span>
                      {locale === "zh-CN"
                        ? getTranslatedStoryText({ text: person.name, locale })
                        : person.name.split(" ")[0]}
                    </span>
                    <small>{liberatorBattles.filter((battle) => battle.character === person.name).length}</small>
                  </button>
                ))}
              </nav>
              <section className="story-campaign" aria-labelledby="story-campaign-heading">
                <div className="story-campaign__heading">
                  <h2 id="story-campaign-heading">
                    {character ? getTranslatedStoryText({ text: character, locale }) : t("story.all")}
                  </h2>
                  <span>{t("story.progress", { completed, total: battles.length })}</span>
                </div>
                {!loaded && <p role="status">{t("common.loading")}</p>}
                <ol className="story-list">
                  {battles.map((battle, index) => {
                    const won = progress?.completed.includes(battle.id) === true;
                    const locked =
                      !!battle.prerequisiteId && progress?.completed.includes(battle.prerequisiteId) !== true;
                    return (
                      <StoryBattleRow
                        key={battle.id}
                        battle={battle}
                        number={index + 1}
                        completed={won}
                        locked={locked}
                        canStart={loaded && !locked && battle.playable}
                        onStart={onStart}
                      />
                    );
                  })}
                </ol>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
