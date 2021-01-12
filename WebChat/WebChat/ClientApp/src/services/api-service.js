import Axios from "axios";
import { authHeader } from './';
import Config from "../config";


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

const searchForUsers = async (value, token) => {
        const result = await Axios.get(`${_baseUrl}users/search?name=${value}`, {
            headers: authHeader(token)
        });
        return await result;
};

const uploadAvatar = async (fromData, token) =>{
    const result = await Axios.post(`${_baseUrl}avatars/upload`, fromData, {
        headers: authHeader(token)
    });
    return await result;
};
const getProfile = async (token) =>{
    const result = await Axios.get(`${_baseUrl}users/getprofile`, {
        headers: authHeader(token)
    });
    return await result;
};

const getMessages = async (threadId, token) => {
    const result = await Axios.get(`${_baseUrl}thread/getmessages/${threadId}`, {
        headers: authHeader(token)
    });
    return await result;
};

const getThreads = async (token) => {
    const result = await Axios.get(`${_baseUrl}hey/getthreads`, {
        headers: authHeader(token)
    });
    return await result;
};

const createThread = async (oponentViewModel, token) => {
    const result = await Axios.post(`${_baseUrl}hey/createthread`, {
        OponentVM: oponentViewModel
    }, {
        headers: authHeader(token)
    });
    return await result;
};

const sendMessageToApi = async (messageViewModel, token) => {
    const result = await Axios.post(`${_baseUrl}hey/send`, messageViewModel, {
        headers: authHeader(token)
    });
    return await result;
};

const searchForMessageInThread = async (token, params) => {
    const result = await Axios.get(`${_baseUrl}thread/search`, {
        headers: authHeader(token),
        params: params
    });
    return await result;
}

const updateUsersProfile = async (token, user) => {
    const result = await Axios.post(`${_baseUrl}users/update`, user, {
        headers: authHeader(token)
    });
    return await result;
};

export { getProfile, getMessages, getThreads, createThread, sendMessageToApi, uploadAvatar, searchForUsers, login, register, searchForMessageInThread, updateUsersProfile } ;