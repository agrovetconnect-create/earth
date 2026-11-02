import { Router } from 'express';
import {
  addMediaHandler,
  answerQuestionHandler,
  createCommentHandler,
  getPostHandler,
  listCommentsHandler,
  listMyPostsHandler,
  listMyQuestionsHandler,
<<<<<<< HEAD
  removeMediaHandler,
  samePlaceHandler,
  servePostMediaHandler,
=======
  samePlaceHandler,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  updateAttachmentDownloadHandler,
  updatePostHandler,
} from '../controllers/posts.controller.js';
import { attachViewer, requireUser } from '../utils/user-auth.js';

export const postsRouter = Router();

/**
<<<<<<< HEAD
 * Community observation posts (Stage 12 + contributor-token owner parity).
 *
 * Reads accept an optional session or contributor token. Owner mutations
 * accept either a verified session (`req.viewer`) or a matching pseudonymous
 * `X-Contributor-Token` so contributors who pinned an observation via Web or
 * Mobile can always unpin, make private, edit, or manage supporting media.
 */

postsRouter.get('/api/posts/:passportId/media/:mediaId', attachViewer, servePostMediaHandler);
=======
 * Community observation posts (Stage 12).
 *
 * Reads accept an optional session: an anonymous visitor sees a public post,
 * its contributor's words, the model's interpretation, the gallery and the
 * discussion. Writes require a session, and the service decides whether the
 * caller owns the post.
 */

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
postsRouter.get('/api/posts/:passportId', attachViewer, getPostHandler);
postsRouter.get('/api/posts/:passportId/same-place', attachViewer, samePlaceHandler);
postsRouter.get('/api/posts/:passportId/comments', attachViewer, listCommentsHandler);
postsRouter.post('/api/posts/:passportId/comments', requireUser, createCommentHandler);
<<<<<<< HEAD
postsRouter.patch('/api/posts/:passportId', attachViewer, updatePostHandler);
postsRouter.patch(
  '/api/posts/:passportId/attachments/:attachmentId',
  attachViewer,
=======
postsRouter.patch('/api/posts/:passportId', requireUser, updatePostHandler);
postsRouter.patch(
  '/api/posts/:passportId/attachments/:attachmentId',
  requireUser,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  updateAttachmentDownloadHandler
);
postsRouter.post(
  '/api/posts/:passportId/questions/:questionId/answer',
<<<<<<< HEAD
  attachViewer,
  answerQuestionHandler
);
postsRouter.post('/api/posts/:passportId/media', attachViewer, addMediaHandler);
postsRouter.delete('/api/posts/:passportId/media/:mediaId', attachViewer, removeMediaHandler);

postsRouter.get('/api/me/observations', attachViewer, listMyPostsHandler);
=======
  requireUser,
  answerQuestionHandler
);
postsRouter.post('/api/posts/:passportId/media', requireUser, addMediaHandler);

postsRouter.get('/api/me/observations', requireUser, listMyPostsHandler);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
postsRouter.get('/api/me/questions', requireUser, listMyQuestionsHandler);
