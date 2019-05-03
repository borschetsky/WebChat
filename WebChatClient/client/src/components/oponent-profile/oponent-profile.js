import React, { Component } from 'react';
import './oponent-profile.css';

export default class OponentProfile extends Component {
    render(){
        console.log(this.props.name);
        return(
            <div className="oponent-profile">
                <img src="http://emilcarlsson.se/assets/harveyspecter.png" alt=""/>
                <p>{this.props.name}</p>
            </div>
            );
    };
};