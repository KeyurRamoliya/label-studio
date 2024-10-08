import { type FC, type MouseEventHandler, useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";

import { IconCommentLinkTo } from "../../../assets/icons";
import { ReactComponent as IconSend } from "../../../assets/icons/send.svg";
import { Tooltip } from "../../../common/Tooltip/Tooltip";
import { LINK_COMMENT_MODE } from "../../../stores/Annotation/LinkingModes";
import { CommentBase } from "../../../stores/Comment/Comment";
import { TextArea } from "../../../common/TextArea/TextArea";
import type { ActionRefValue } from "../../../common/TextArea/TextArea";
import { Block, Elem } from "../../../utils/bem";
import { FF_DEV_3873, isFF } from "../../../utils/feature-flags";

import { LinkState } from "./LinkState";
import "./CommentForm.scss";
import { NewTaxonomy as Taxonomy } from "../../../components/NewTaxonomy/NewTaxonomy";
import { parseCommentClassificationConfig, taxonomyPathsToSelectedItems } from "./CommentClassificationUtil";

// TODO(jo): figure out how to get the taxonomy from the project.
// For now, just use a hardcoded string.
const taxoString = `<Taxonomy name="default">
  <TaxonomyItem value="title">
    <TaxonomyItem value="spelling" />
    <TaxonomyItem value="grammar" />
  </TaxonomyItem>
  <TaxonomyItem value="subtitle">
    <TaxonomyItem value="spelling" />
    <TaxonomyItem value="grammar" />
  </TaxonomyItem>
</Taxonomy>`;

export type CommentFormProps = {
  commentStore: any;
  annotationStore: any;
  inline?: boolean;
};

const ROWS = 1;
const MAX_ROWS = 4;
const TOOLTIP_DELAY = 0.8;

export const CommentForm: FC<CommentFormProps> = observer(({ commentStore, annotationStore, inline = true }) => {
  const formRef = useRef<HTMLFormElement>(null);
  const actionRef = useRef<ActionRefValue>({});
  const clearTooltipMessage = () => commentStore.setTooltipMessage("");
  const globalLinking = annotationStore.selected && annotationStore.selected.linkingMode === LINK_COMMENT_MODE;
  const [linkingComment, setLinkingComment] = useState();

  const getCurrentComment = useCallback(
    (mayCreate = true) => {
      let currentComment = commentStore.commentInProgress;
      if (!currentComment && mayCreate) {
        currentComment = CommentBase.create({ text: "" }, { annotationStore: commentStore.annotationStore });
        commentStore.setCurrentComment(currentComment);
      }
      return currentComment;
    },
    [commentStore],
  );

  const updateComment = useCallback(
    (comment: string) => {
      const currentComment = getCurrentComment();
      currentComment.setText(comment);
    },
    [commentStore, annotationStore],
  );

  const updateCommentClassifications = useCallback(
    (classifications: object | null) => {
      const currentComment = getCurrentComment();
      currentComment.setClassifications(classifications);
    },
    [commentStore, annotationStore],
  );

  const linkToHandler: MouseEventHandler<HTMLElement> = useCallback(
    (e) => {
      e?.preventDefault?.();
      const globalLinking = annotationStore.selected && annotationStore.selected.linkingMode === LINK_COMMENT_MODE;
      if (globalLinking) {
        annotationStore.selected.stopLinkingMode();
        return;
      }
      const currentComment = getCurrentComment();
      setLinkingComment(currentComment);
      annotationStore.selected.startLinkingMode(LINK_COMMENT_MODE, currentComment);
    },
    [commentStore, annotationStore],
  );

  const onSubmit = useCallback(
    async (e?: any) => {
      e?.preventDefault?.();

      if (!formRef.current || commentStore.loading === "addComment") return;

      const currentComment = getCurrentComment(false);
      const text = currentComment?.text;
      const regionRef = currentComment?.regionRef;
      const classifications = currentComment?.classifications;

      if (!text.trim() && !classifications) return;

      try {
        commentStore.setCurrentComment(undefined);

        const commentProps = {
          text,
          regionRef,
          classifications,
        };
        await commentStore.addComment(commentProps);
      } catch (err) {
        commentStore.setCurrentComment(currentComment);
        console.error(err);
      }
    },
    [commentStore, annotationStore],
  );

  useEffect(() => {
    if (!isFF(FF_DEV_3873)) {
      commentStore.setAddedCommentThisSession(false);
      clearTooltipMessage();
    }
    return () => clearTooltipMessage();
  }, []);

  useEffect(() => {
    if (isFF(FF_DEV_3873)) {
      commentStore.tooltipMessage && actionRef.current?.el?.current?.focus({ preventScroll: true });
    }
  }, [commentStore.tooltipMessage]);

  useEffect(() => {
    commentStore.setInputRef(actionRef.current?.el);
    commentStore.setCommentFormSubmit(() => onSubmit());
  }, [actionRef, commentStore]);

  const currentLinkingComment = annotationStore.selected.currentLinkingMode?.comment;
  const currentComment = getCurrentComment();
  const { text = "", regionRef, classifications } = currentComment || {};
  const { region } = regionRef || {};
  const linking = !!linkingComment && currentLinkingComment === linkingComment && globalLinking;
  const hasLinkState = linking || region;
  const selections = taxonomyPathsToSelectedItems(classifications?.default?.values);
  const classificationsItems = parseCommentClassificationConfig(commentStore.commentClassificationConfig);

  const Buttons = () => (
    <Elem name="buttons">
      {!region && (
        <Tooltip title="Link to..." mouseEnterDelay={TOOLTIP_DELAY}>
          <Elem name="action" tag="button" mod={{ highlight: linking }} onClick={linkToHandler}>
            <IconCommentLinkTo />
          </Elem>
        </Tooltip>
      )}
      <Elem name="action" tag="button" type="submit">
        <IconSend />
      </Elem>
    </Elem>
  );

  return (
    <Block ref={formRef} tag="form" name="comment-form-new" mod={{ inline, linked: !!region }} onSubmit={onSubmit}>
      <Elem name="text-row">
        <TextArea
          actionRef={actionRef}
          name="comment"
          placeholder="Add a comment"
          value={text}
          rows={ROWS}
          maxRows={MAX_ROWS}
          onInput={updateComment}
          onSubmit={inline ? onSubmit : undefined}
          onBlur={clearTooltipMessage}
        />
        {classificationsItems.length === 0 && <Buttons />}
      </Elem>
      {classificationsItems.length > 0 && (
        <Elem name="classifications-row">
          <Elem name="category-selector">
            <Taxonomy
              selected={selections}
              items={classificationsItems}
              onChange={async (_, values) => {
                const newClassifications =
                  values.length > 0
                    ? {
                        default: {
                          type: "taxonomy",
                          values,
                        },
                      }
                    : null;
                updateCommentClassifications(newClassifications);
              }}
              options={{ pathSeparator: "/", showFullPath: true }}
              defaultSearch={false}
            />
          </Elem>
          <Buttons />
        </Elem>
      )}
      {hasLinkState && (
        <Elem name="link-state">
          <LinkState linking={linking} region={region} onUnlink={currentComment?.unsetLink} />
        </Elem>
      )}
      {commentStore.tooltipMessage && <Elem name="tooltipMessage">{commentStore.tooltipMessage}</Elem>}
    </Block>
  );
});
