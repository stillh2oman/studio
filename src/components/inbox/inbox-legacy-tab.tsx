"use client";

/**
 * Previous “Automated Inbox” UI — kept for emergency rollback only.
 * Not mounted from `page.tsx`. To restore: import `InboxLegacy` and render it instead of `InboxTab`.
 */
import { useInboxTabModel, type InboxTabProps } from "./inbox-tab-model";
import { InboxLegacyLayout } from "./inbox-legacy-layout";

export function InboxLegacy(props: InboxTabProps) {
  const model = useInboxTabModel(props);
  return <InboxLegacyLayout model={model} />;
}
