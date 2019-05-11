import React, { Component } from 'react';
import './oponent-profile.css';
import { withAuth } from '../hoc';
import Axios from 'axios';
import { getDefaultImageUrl, getUserAvatar } from '../../services';

 class OponentProfile extends Component {
    state = {
        profile: '',
        oponentId: null
    }

    componentDidMount(){
        this.setState({oponentId: this.props.oponentId});
    }
    componentDidUpdate(prevProps){
        if(prevProps.oponentId !== this.props.oponentId){
            this.setState({oponentId: this.props.oponentId});
            this.getProfile();
        }
    }
    getProfile = () =>{
        const { oponentId } = this.props;
        const { token } = this.props.user;

        Axios.get(`http://localhost:5000/api/users/profilebyid/${oponentId}`,{
            headers:{'Authorization': `Bearer ${token}`}
        }).then(res => this.setState({profile: res.data}));
    }
    render(){
        const { avatarFileName, name} = this.state.profile;
        const { oponentId } = this.state
        const imagePath = !avatarFileName ? getDefaultImageUrl(name) : getUserAvatar(avatarFileName);
        if(!oponentId){
            return(<div></div>)
        }
        return(
            <div className="oponent-profile">
                <img src={imagePath} alt="avatar"/>
                <p>{name}</p>
            </div>
            );
    };
};

export default withAuth(OponentProfile);