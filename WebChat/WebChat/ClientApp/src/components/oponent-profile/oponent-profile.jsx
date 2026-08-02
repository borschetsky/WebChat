import React, { Component } from 'react';
import './oponent-profile.css';
import { withAuth } from '../hoc';
import { getDefaultImageUrl, getUserAvatar, defaultimage } from '../../services';

 class OponentProfile extends Component {
    state = {
        profile: {},
    }

    componentDidMount(){
        this.setState({
            profile: this.props.profile
        });
    };

    componentDidUpdate(prevProps){
        if(prevProps.profile !== this.props.profile){
            this.setState({profile: this.props.profile})
        };
    };
 
    render(){
        
        const { profile } = this.state;
        const { handleSearchbar } = this.props;
        const imagePath = profile.avatarFileName === null ? getDefaultImageUrl(profile.username) : getUserAvatar(profile.avatarFileName);
        if(!profile.id){
            return(<div className="oponent-profile">
                <p></p>
        </div>)
        }
        const satus = profile.isOnline ? 'online now' : 'offline';
        const typingStatus = profile.isTyping ? 'typing...' : satus;
        return(
            <div className="oponent-profile">
                <img onError={defaultimage} src={imagePath} alt="avatar" name={profile.username}/>
                <div className="info">
                    <p className="username">{profile.username}</p>
                    <p className="satus">{typingStatus}</p>
                </div>
                <div className="aside">
                    <div className="aside-search">
                        <i className="material-icons md-32" onClick={() => handleSearchbar()}>search</i>
                    </div>
                    
                </div>
            </div>
            );
    };
};

export default withAuth(OponentProfile);