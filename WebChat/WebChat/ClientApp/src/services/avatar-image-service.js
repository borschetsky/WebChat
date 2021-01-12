import Config from "../config";

const getUserAvatar = (fileName) =>{
     const url = `${Config.network.api}images/${fileName}`;
     return url;
};

export default getUserAvatar;