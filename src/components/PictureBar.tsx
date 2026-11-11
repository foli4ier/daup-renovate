import { copy } from "../copy";
import { nextReaction, reactionLines } from "../lib/spend";
import { activeProperty } from "../state/select";
import { useRenovate } from "../state/store";
import type { ReactionKind } from "../state/types";

export function PictureBar({
  kind,
  planId,
  zoneId,
  pictureId,
  onChat,
}: {
  kind: "before" | "after";
  planId: string;
  zoneId: string;
  pictureId: string;
  onChat: () => void;
}) {
  const { state, dispatch } = useRenovate();
  const viewerId = activeProperty(state)?.ownerId ?? "";
  const proposal =
    kind === "after"
      ? state.proposals.find((item) => item.id === pictureId && item.planId === planId && item.zoneId === zoneId)
      : undefined;
  const lines = reactionLines(proposal?.reactions, viewerId);
  const mine = proposal?.reactions?.find((item) => item.personId === viewerId);

  function tap(reaction: ReactionKind) {
    if (!viewerId || !proposal) return;
    dispatch({
      type: "set-reaction",
      planId,
      zoneId,
      proposalId: proposal.id,
      personId: viewerId,
      name: mine?.name ?? "",
      kind: nextReaction(mine?.kind, reaction),
    });
  }

  return (
    <div className="after-reactions">
      <div className="reaction-row">
        {kind === "after" ? (
          <>
            <button className="btn btn-outline" type="button" aria-pressed={mine?.kind === "like"} onClick={() => tap("like")}>
              {copy.like}
            </button>
            <button className="btn btn-outline" type="button" aria-pressed={mine?.kind === "dislike"} onClick={() => tap("dislike")}>
              {copy.dislike}
            </button>
          </>
        ) : null}
        <button className="btn btn-outline" type="button" onClick={onChat}>
          {copy.chat}
        </button>
      </div>
      {kind === "after" && lines.liked ? <p className="reaction-names">{lines.liked}</p> : null}
      {kind === "after" && lines.disliked ? <p className="reaction-names">{lines.disliked}</p> : null}
    </div>
  );
}
