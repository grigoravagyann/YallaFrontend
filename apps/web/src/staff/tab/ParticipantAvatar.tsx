import type { TabStaffParticipant } from '@yalla/api';
import { useState } from 'react';
import { initialsOf } from './tabRules';

/**
 * The person's own photo when their account has one — the waiter's "who is
 * who" at a table of six — and their initials otherwise, or when the photo
 * does not load. Decorative: the name is beside it.
 *
 * A failed load is remembered for that photo only. Keyed by its link, so a
 * new photo (the person changed it, or the tab refetched with fresh links)
 * gets its own try instead of inheriting the old one's failure.
 */
export function ParticipantAvatar({
  person,
  name,
}: {
  readonly person: TabStaffParticipant;
  readonly name: string;
}) {
  const url = person.photo?.thumbnailUrl ?? null;
  return <AvatarFace key={url ?? ''} url={url} initials={initialsOf(name)} />;
}

function AvatarFace({ url, initials }: { readonly url: string | null; readonly initials: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar tab-avatar" aria-hidden="true">
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}
