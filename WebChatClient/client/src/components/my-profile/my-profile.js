import React, { Component } from 'react';
import './my-profile.css';
import {getDefaultImageUrl, getUserAvatar} from '../../services/';

class MyProfile extends Component {
    state = {
        loading: true,
        profile: null
    }

    componentDidMount = () => {
        this.setState({profile: this.props.profile, loading: false}, () => console.log(this.state.profiles))
        
    };

    componentDidUpdate = (prevProps, prevState) =>{
        if(prevProps !== this.props){
            this.setState({
                profile: this.props.profile,
                loading: false
            }, console.log(this.state.profile));
        }
    }

    render(){
        if(this.state.profile === null){
            return(
            <div className="my-profile">
               Loading...
             </div>
            );
        }
        let content;
        if(this.state.profile !== null){
            
            const {  handleLogOut} = this.props;
            const { avatarFileName, username} = this.state.profile;
            const imagePath = !avatarFileName ? getDefaultImageUrl(username) : getUserAvatar(avatarFileName);
            content = (
                <React.Fragment>
                    <div className="avatar">
                        <span className="edit" onClick={() => this.props.handleEditorClose()}>
                            <i className="material-icons">create</i>
                        </span>
                        <img src={imagePath} alt="avatar"/>
                    </div>
                    <div className="my-username">
                        <p>{username}</p>
                    </div>
                    <div className="navbar" onClick={() => handleLogOut()}>
                        <div className="log-out" >
                            <i className="material-icons">power_settings_new</i>
                            <p>Log Out</p>
                        </div>
                    </div>
                </React.Fragment>
            )
        }
        

        const displayElement = content;
        return(
            <div className="my-profile">
               {displayElement}
             </div>
        );
    };
};

export default MyProfile;