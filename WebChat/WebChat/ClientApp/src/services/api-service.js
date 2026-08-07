import Axios from 'axios';
// Import the module directly, not the barrel: services/index.js imports this file, so
// going through it makes the dependency circular.
import authHeader from './auth-header';
import Config from '@/config';

// const _baseUrl = 'https://localhost:44397/api/';
export const _baseUrl = `${Config.network.api}api/`;

const register = async (registerObj) => {
  const result = await Axios.post(`${_baseUrl}auth/register`, registerObj);
  return await result;
};

const login = async (loginObj) => {
  const result = await Axios.post(`${_baseUrl}auth/login`, loginObj);
  return await result;
};

// Exchanges the token from an activation link for a session. The link points at the API
// rather than here, so this is only reached when the SPA route hands the token back.
const confirmEmail = async (token) => {
  const result = await Axios.get(`${_baseUrl}auth/confirm?token=${encodeURIComponent(token)}`);
  return await result;
};

// Always resolves with the same 200 whatever the address is - the endpoint deliberately
// gives nothing away about which addresses hold accounts.
const forgotPassword = async (email) => {
  const result = await Axios.post(`${_baseUrl}auth/forgot-password`, { email });
  return await result;
};

const resetPassword = async (token, password) => {
  const result = await Axios.post(`${_baseUrl}auth/reset-password`, { token, password });
  return await result;
};

const resendConfirmation = async (email) => {
  const result = await Axios.post(`${_baseUrl}auth/resend-confirmation`, { email });
  return await result;
};

const searchForUsers = async (value, token) => {
  const result = await Axios.get(`${_baseUrl}users/search?name=${value}`, {
    headers: authHeader(token),
  });
  return await result;
};

const uploadAvatar = async (fromData, token) => {
  const result = await Axios.post(`${_baseUrl}avatars/upload`, fromData, {
    headers: authHeader(token),
  });
  return await result;
};
const getProfile = async (token) => {
  const result = await Axios.get(`${_baseUrl}users/getprofile`, {
    headers: authHeader(token),
  });
  return await result;
};

const getMessages = async (threadId, token) => {
  const result = await Axios.get(`${_baseUrl}thread/getmessages/${threadId}`, {
    headers: authHeader(token),
  });
  return await result;
};

const getThreads = async (token) => {
  const result = await Axios.get(`${_baseUrl}hey/getthreads`, {
    headers: authHeader(token),
  });
  return await result;
};

// The creator is added by the server, so only the other members are sent - a client cannot
// create a group it is not in, and therefore cannot create one it has no right to read.
const createGroup = async (name, memberIds, token) => {
  const result = await Axios.post(
    `${_baseUrl}hey/creategroup`,
    {
      Name: name,
      MemberIds: memberIds,
    },
    {
      headers: authHeader(token),
    },
  );
  return await result;
};

const createThread = async (oponentViewModel, token) => {
  const result = await Axios.post(
    `${_baseUrl}hey/createthread`,
    {
      OponentVM: oponentViewModel,
    },
    {
      headers: authHeader(token),
    },
  );
  return await result;
};

const sendMessageToApi = async (messageViewModel, token) => {
  const result = await Axios.post(`${_baseUrl}hey/send`, messageViewModel, {
    headers: authHeader(token),
  });
  return await result;
};

const searchForMessageInThread = async (token, params) => {
  const result = await Axios.get(`${_baseUrl}thread/search`, {
    headers: authHeader(token),
    params: params,
  });
  return await result;
};

const updateUsersProfile = async (token, user) => {
  const result = await Axios.post(`${_baseUrl}users/update`, user, {
    headers: authHeader(token),
  });
  return await result;
};

export {
  getProfile,
  getMessages,
  getThreads,
  createThread,
  createGroup,
  sendMessageToApi,
  uploadAvatar,
  searchForUsers,
  login,
  register,
  confirmEmail,
  resendConfirmation,
  forgotPassword,
  resetPassword,
  searchForMessageInThread,
  updateUsersProfile,
};
