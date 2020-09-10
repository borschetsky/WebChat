const getUserAvatar = (fileName) =>{
     const url = `http://localhost:5000/images/${fileName}`;
     return url;
};

export default getUserAvatar;