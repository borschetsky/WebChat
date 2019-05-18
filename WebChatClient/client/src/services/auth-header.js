
const authHeader = (token) => {
    if(token.length !== 0){
        return {'Authorization': `Bearer ${token}`}
    }else{
        return {};
    }
};

export default authHeader;