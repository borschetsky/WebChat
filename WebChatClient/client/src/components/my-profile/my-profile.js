import React from 'react';
import './my-profile.css';



const MyProfile = (props) => {
    const { username, handleLogOut } = props;
    const usernameDisplay = !username ? 'Loading...' : username;
    return (
        <div className="my-profile">
            <div className="avatar">
                <img src="http://emilcarlsson.se/assets/harveyspecter.png" alt="avatar"/>
            </div>
            <div className="my-username">
                <p>{usernameDisplay}</p>
            </div>
            <div className="navbar" onClick={() => handleLogOut()}>
                <div className="log-out" >
                    <i className="material-icons">power_settings_new</i>
                    <p>Log Out</p>
                </div>
            </div>
            
        </div>
    );
};

export default MyProfile;