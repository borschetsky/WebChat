import React, { Component } from 'react';
import './oponent-profile.css';
import { withAuth } from '../hoc';
import { getDefaultImageUrl, getUserAvatar, defaultimage } from '../../services';

 class OponentProfile extends Component {
    state = {
        profile: '',
        oponentId: null
    }

    componentDidMount(){
        this.setState({
            oponentId: this.props.oponentId,
            profile: this.props.profile
        });
        
    }
    componentDidUpdate(prevProps){
        if(prevProps.oponentId !== this.props.oponentId){
            this.setState({oponentId: this.props.oponentId});
        }
        if(prevProps.profile !== this.props.profile){
            this.setState({profile: this.props.profile})
        }
        
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
        return(
            <div className="oponent-profile">
                <img onError={defaultimage} src={imagePath} alt="avatar" name={profile.username}/>
                <p>{profile.username}</p>
            </div>
            );
    };
};

export default withAuth(OponentProfile);