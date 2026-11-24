import { Router } from 'express';
import { addAttachmentHandler, addMediaHandler, answerQuestionHandler, createCommentHandler, getPostHandler, listCommentsHandler, listMyPostsHandler, reactToCommentHandler, removeMediaHandler, samePlaceHandler, serveAttachmentHandler, servePostMediaHandler, updateAttachmentDownloadHandler, updatePostHandler, } from '../controllers/posts.controller.js';
import { attachViewer, requireUser } from '../utils/user-auth.js';
export const postsRouter = Router();
/**
 * Community observation posts (Stage 12 + contributor-token owner parity).
 *
 * Reads accept an optional session or contributor token. Owner mutations
 * accept either a verified session (`req.viewer`) or a matching pseudonymous
 * `X-Contributor-Token` so contributors who pinned an observation via Web or
 * Mobile can always unpin, make private, edit, or manage supporting media.
 */
postsRouter.get('/api/posts/:passportId/media/:mediaId', attachViewer, servePostMediaHandler);
postsRouter.get('/api/posts/:passportId/attachments/:attachmentId', attachViewer, serveAttachmentHandler);
postsRouter.post('/api/posts/:passportId/attachments', attachViewer, addAttachmentHandler);
postsRouter.get('/api/posts/:passportId', attachViewer, getPostHandler);
postsRouter.get('/api/posts/:passportId/same-place', attachViewer, samePlaceHandler);
postsRouter.get('/api/posts/:passportId/comments', attachViewer, listCommentsHandler);
postsRouter.post('/api/posts/:passportId/comments', requireUser, createCommentHandler);
postsRouter.post('/api/posts/:passportId/comments/:commentId/react', attachViewer, reactToCommentHandler);
postsRouter.patch('/api/posts/:passportId', attachViewer, updatePostHandler);
postsRouter.patch('/api/posts/:passportId/attachments/:attachmentId', attachViewer, updateAttachmentDownloadHandler);
postsRouter.post('/api/posts/:passportId/questions/:questionId/answer', attachViewer, answerQuestionHandler);
postsRouter.post('/api/posts/:passportId/media', attachViewer, addMediaHandler);
postsRouter.delete('/api/posts/:passportId/media/:mediaId', attachViewer, removeMediaHandler);
postsRouter.get('/api/me/observations', attachViewer, listMyPostsHandler);
