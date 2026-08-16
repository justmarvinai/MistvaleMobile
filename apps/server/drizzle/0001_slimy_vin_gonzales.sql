CREATE TABLE "asset_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_key" text NOT NULL,
	"track" text NOT NULL,
	"path" text NOT NULL,
	"frames" integer DEFAULT 1 NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_entries" (
	"content_type" text NOT NULL,
	"key" text NOT NULL,
	"state" text NOT NULL,
	"data" jsonb NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_entries_content_type_key_state_pk" PRIMARY KEY("content_type","key","state"),
	CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'item', 'campaignChapter', 'stage', 'gameConfig')),
	CONSTRAINT "content_entries_state_check" CHECK ("content_entries"."state" in ('live', 'draft'))
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"rev" integer PRIMARY KEY NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text NOT NULL,
	"account_id" text,
	"note" text DEFAULT '' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asset_uploads_key_track_key" ON "asset_uploads" USING btree ("asset_key","track");--> statement-breakpoint
CREATE INDEX "asset_uploads_asset_key_idx" ON "asset_uploads" USING btree ("asset_key");--> statement-breakpoint
CREATE INDEX "content_entries_type_state_idx" ON "content_entries" USING btree ("content_type","state");--> statement-breakpoint
CREATE INDEX "content_revisions_published_at_idx" ON "content_revisions" USING btree ("published_at");