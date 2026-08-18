-- P10c: `soundCue` becomes the twenty-fourth content type.
--
-- Every sound the game makes is a content entry naming a bus and either a recording or a
-- handful of synth parameters, so an operator can retune the interface's voice without a
-- deploy and a dropped-in audio pack is one field per cue rather than a code change.
ALTER TABLE "content_entries" DROP CONSTRAINT "content_entries_type_check";--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop', 'mastery', 'quest', 'mission', 'event', 'loginTrack', 'newsPost', 'tutorialStep', 'soundCue', 'gameConfig'));
