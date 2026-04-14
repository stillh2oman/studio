"use client";

import { useInboxTabModel, type InboxTabProps } from "./inbox-tab-model";
import { InboxLegacyLayout } from "./inbox-legacy-layout";

export type { InboxTabProps } from "./inbox-tab-model";

export function InboxTab(props: InboxTabProps) {
  const model = useInboxTabModel(props);
  return <InboxLegacyLayout model={model} />;
}
