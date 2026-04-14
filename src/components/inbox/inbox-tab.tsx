"use client";

import { useInboxTabModel, type InboxTabProps } from "./inbox-tab-model";
import { InboxGmailLayout } from "./inbox-gmail-layout";

export type { InboxTabProps } from "./inbox-tab-model";

export function InboxTab(props: InboxTabProps) {
  const model = useInboxTabModel(props);
  return <InboxGmailLayout model={model} />;
}
