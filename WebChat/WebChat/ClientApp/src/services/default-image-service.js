const getDefaultImageUrl = (userName) => {
    return `https://ui-avatars.com/api/?name=${userName}&background=435f7a&color=fff&size=256&font-size=0.55`;
};

const defaultimage = (e) => {
    
    e.target.src = getDefaultImageUrl(e.target.name);
    
}

export  {getDefaultImageUrl, defaultimage} ;  
//https://ui-avatars.com/api/?name=John+Doe&background=435f7a&color=fff&size=256&font-size=0.55