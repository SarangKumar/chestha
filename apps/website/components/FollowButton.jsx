import { followAction } from '@/app/user/[username]/actions';
import { buttonClass } from './ui/Button';

/**
 * Follow / unfollow, as a form rather than a link.
 *
 * A GET that changes who you follow can be triggered by any page that embeds
 * the URL — the same reason sign-out is a POST. A form also means this works
 * with JavaScript disabled and needs no client component.
 *
 * It renders nothing for a signed-out visitor and nothing on your own profile.
 * A disabled "Follow" would be a control that exists to say no.
 */
export function FollowButton({ handle, following, canFollow }) {
  if (!canFollow) return null;

  return (
    <form action={followAction}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="intent" value={following ? 'unfollow' : 'follow'} />
      <button
        type="submit"
        className={buttonClass({ variant: following ? 'outline' : 'default', size: 'sm' })}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </form>
  );
}
