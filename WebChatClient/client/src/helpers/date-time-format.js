const getDateInfoForThread = (jsonTimeformat) => {
    const dateNow = new Date().getDate();
    const messageTime = new Date(jsonTimeformat).getDate();
    if(dateNow - messageTime === 0){
        return new Date(jsonTimeformat).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit'});
    }
    if(dateNow - messageTime === 1){
        return 'Yesterday';
    }
    if(dateNow - messageTime > 1){
        return new Date(jsonTimeformat).toLocaleDateString('en-BG', {month: 'short', day: 'numeric'});
    }
};

const getDateInfoForMessage = (jsonTimeFormat) =>{
    return new Date(jsonTimeFormat).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit'});
    
};

const getDateInfoForSeparator = (jsonTimeFormat) => {
    const dateNow = new Date().getDate();
    const messageDate = new Date(jsonTimeFormat).getDate();
    const numberOfDays = dateNow - messageDate;
    const date = new Date(jsonTimeFormat).toLocaleDateString('en-BG', {month: 'short', day: 'numeric'});
    if(numberOfDays > 1 && numberOfDays < 7){
        return `${numberOfDays} days ago`; 
    }
    switch(numberOfDays){
        case 0:
            return `Today`;
        case 1:
            return `Yesterday`;
        case (numberOfDays > 1 && numberOfDays < 7):
            console.log('Hello');
            return `${numberOfDays} days ago`;     
        case 7:
            return `Week ago`;   
        default:
            return `${date}`; 
    };

}
export { getDateInfoForThread, getDateInfoForMessage, getDateInfoForSeparator }