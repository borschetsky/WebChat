import React, { Component } from 'react';
import './oponent-profile.css';
import { withAuth } from '../hoc';
import { getDefaultImageUrl, getUserAvatar, defaultimage } from '../../services';

 class OponentProfile extends Component {
    state = {
        profile: {},
        oponentId: null
    }

    componentDidMount(){
        this.setState({
            oponentId: this.props.oponentId,
            profile: this.props.profile
        }, console.log(this.state.profile));
        
            // this.timer = setTimeout(this.stopTyping(), 3000);
        
        
        
    }
    componentDidUpdate(prevProps){
        if(prevProps.oponentId !== this.props.oponentId){
            this.setState({oponentId: this.props.oponentId});
        }
        if(prevProps.profile !== this.props.profile){
            this.setState({profile: this.props.profile})
        }
        
    }

    componentWillMount(){
        clearTimeout(this.timer);
    }

    stopTyping = () => {
        const { profile } = this.state;
        profile.isTyping = false;
        this.setState({profile}, console.log(this.state.profile));
    }
    
    render(){
        const { profile } = this.state;
        
        const { oponentId } = this.state;
        const imagePath = profile.avatarFileName === null ? getDefaultImageUrl(profile.username) : getUserAvatar(profile.avatarFileName);
        if(!oponentId){
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
                
            </div>
            );
    };
};

export default withAuth(OponentProfile);