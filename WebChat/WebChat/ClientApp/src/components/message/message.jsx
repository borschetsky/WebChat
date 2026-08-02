import React from 'react';
import './message.css';
import { defaultimage, getUserAvatar } from '../../services';  


function Message(props) {
    
    const classToDispay = props.profile.id === props.senderId ? 'replies' : 'recived';
    const { profile, opponentProfile, senderId, username} = props;
    const imagePath = senderId === profile.id ? getUserAvatar(profile.avatarFileName) : getUserAvatar(opponentProfile.avatarFileName);
    
    
    return (
            <li className={ classToDispay }>
                <img onError={defaultimage} src={imagePath} alt="avatar" height="22" width="22" name={username}/>
                <div className="name-time">
                    <p className="message-name">{props.username}</p>
                    <span>{props.time}</span>
                </div>
                
                <div className="tooltip">
                    <p>{props.text}</p>
                    
                </div>
               
            </li>
    );
};

export default Message;