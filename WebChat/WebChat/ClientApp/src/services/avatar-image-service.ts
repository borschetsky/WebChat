import Config from '@/config';

/**
 * Public URL for an uploaded avatar. Files are written to wwwroot/images by
 * WebChat.AvatarWriter and served as static content.
 */
const getUserAvatar = (fileName: string): string => `${Config.network.api}images/${fileName}`;

export default getUserAvatar;
