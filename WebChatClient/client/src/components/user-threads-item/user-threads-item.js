import React from 'react';
import { defaultimage } from '../../services';

const UserThreadsItem = (props) => {
    const {  oponentVM, imagePath, classStatus, typingOrLM, lastMessageTime} = props;
    return(
        <div className="clearfix-wrapper" >
            <img onError={defaultimage} src={imagePath} alt="avatar" name={oponentVM.username} className={`oponent ${classStatus}`} />
            <div className="about">
                <p className="name">{oponentVM.username}</p>
                <p className="status">
                    {typingOrLM}
                </p>
            </div>
            <span><small>{lastMessageTime}</small></span>
        </div>
         );
};
export default UserThreadsItem;