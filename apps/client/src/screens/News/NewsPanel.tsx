import { useEffect, type JSX } from 'react';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { Prose } from '../../ui/Prose/Prose';
import { useNewsStore } from '../../state/newsStore';
import styles from './NewsPanel.module.scss';

/**
 * What the Vale is saying.
 *
 * A dialog rather than a screen: news is something a player reads once and then goes back
 * to what they were doing, and giving it a dock station would be giving a permanent seat to
 * an occasional guest. Pinned posts come first; the rest are newest-first.
 */
export function NewsPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const news = useNewsStore((state) => state.news);
  const loading = useNewsStore((state) => state.loading);
  const error = useNewsStore((state) => state.error);
  const load = useNewsStore((state) => state.load);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const posts = news?.posts ?? [];

  return (
    <Modal
      open={open}
      title="News"
      onClose={onClose}
      width={640}
      footer={
        <Button variant="primary" onClick={onClose}>
          Back to it
        </Button>
      }
    >
      {error && <p className={styles.error}>{error}</p>}

      {loading && !news ? (
        <p className={styles.empty}>Listening…</p>
      ) : posts.length === 0 ? (
        <p className={styles.empty}>Nothing announced. The Vale is quiet, which is rare.</p>
      ) : (
        <ol className={styles.posts}>
          {posts.map((post) => (
            <li key={post.key} className={styles.post}>
              <div className={styles.head}>
                <h3 className={styles.title}>{post.title}</h3>
                {post.pinned && <span className={styles.pinned}>Pinned</span>}
              </div>
              {post.startsAt && (
                <span className={styles.date}>{new Date(post.startsAt).toLocaleDateString()}</span>
              )}
              <Prose text={post.body} />
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
