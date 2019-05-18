import React, { Component } from 'react';
import './user-search.css';
import {getDefaultImageUrl, getUserAvatar, defaultimage } from '../../services';

export default class UserSearch extends Component {
    render(){
        const { users } = this.props;

        const people = users.map( u => {
            
            const { createThread } = this.props;
            const {id, username, avatarFileName } = u;
    
            const imagePath = !avatarFileName ? getDefaultImageUrl(username) : getUserAvatar(avatarFileName);
            const isOnline = u.isOnline ? ' active' : '';
    
            return(
                <li className={`found-users${isOnline}`} key={id} onClick={() => {createThread(u); this.props.clearSearch()}}>
                    <img onError={defaultimage} src={imagePath} alt="avatar" name={u.username}/>
                    <p> {username}</p>
                </li>
            );
        });
        const content = users.length === 0 ? (<h4>No users found</h4>) : people;
        return content;
    };
};