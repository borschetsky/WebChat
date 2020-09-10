import React, { Component } from 'react';
import './register.css';
import {Link} from 'react-router-dom';
import { register } from '../services';

const emailRegex = RegExp(
    /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/
  );

  const formValid = ({ formErrors, ...rest }) => {
    let valid = true;
  
    // validate form errors being empty
    Object.values(formErrors).forEach(val => {
      val.length > 0 && (valid = false);
    });
  
    // validate the form was filled out
    Object.values(rest).forEach(val => {
      val === null && (valid = false);
    });
  
    return valid;
  };  

class Register extends Component {

    state = {
        userName: null,
        email: null,
        password: null,
        repeatPassword: null,
        formErrors: {
            userName:'',
            password: '',
            repeatPassword: '',
            email:''
        }
    };


    onChange = (event) => {
        event.preventDefault();
        const {name, value } = event.target;

        let formErrors = this.state.formErrors;

        switch(name){
            case "userName":
                formErrors.userName = value.length < 3 ? "minimum 3 characters required fro user name" : "";
            break;
            case "email":
                formErrors.email = emailRegex.test(value) ? "" : "invalid email address, please check it";
            break;
            case "password":
                formErrors.password = value.length < 6 ? "minimum 6 characaters required fro password" : "";
            break;
            case "repeatPassword":
                formErrors.repeatPassword = value !== this.state.password ? "Password didn't match, please check!" : "";    
            break;
            default:
                break;

        };

        this.setState({
            [name]: value, formErrors
        });
    };

    onSubmit = (event) => {
        event.preventDefault();
        if(formValid(this.state)){
            const {userName, email, password} = this.state;
            const registerObj = {
                username: userName,
                email: email,
                password: password
            };
            register(registerObj).then(result => {
                var data = JSON.parse(localStorage.getItem('user-data'));
                if(data!= null){
                    localStorage.removeItem('user-data');
                }
                localStorage.setItem('user-data', JSON.stringify(result.data));
                if(result.status === 200){
                    this.props.history.push("/dashboard");
                }
        }).catch(err => {
            console.error(err);
            const {data} = err.response;
            for(let key of Object.keys(data)){
                switch(key){
                    case "email":
                        let formErrors = {...this.state.formErrors};
                        formErrors.email = data.email;
                        this.setState({formErrors});
                    break;
                    case "username":
                        let formErrors2 =  {...this.state.formErrors};
                        formErrors2.userName = data.username;
                        this.setState({formErrors: formErrors2});
                    break;    
                    default:
                    break;
                } 
            };
        });
        };
    };

    render(){
        const {formErrors} = this.state;
        return(
            <div className="wrapper">
                <div className="form-wrapper">
                    <h1>Create Account</h1>
                    <form noValidate onSubmit={this.onSubmit}>
                        <div className="firstName">
                            <label htmlFor="firstName">User Name</label>
                            <input 
                                className={formErrors.userName.length > 0 ? "error" : null}
                                placeholder="User Name"
                                type="text"
                                name="userName"
                                noValidate 
                                onChange={ this.onChange}
                                />
                        </div>
                        {formErrors.userName.length > 0 && (
                        <span className="errorMessage">{formErrors.userName}</span>)}
                        <div className="email">
                            <label htmlFor="email">Email</label>
                            <input 
                                className={formErrors.email.length > 0 ? "error" : null}
                                placeholder="Email"
                                type="email"
                                name="email"
                                noValidate 
                                onChange={ this.onChange }
                                />
                        </div>
                        {formErrors.email.length > 0 && (<span className="errorMessage">{formErrors.email}</span>)}
                        <div className="password">
                            <label htmlFor="password">Password</label>
                            <input 
                                className={formErrors.password.length > 0 ? "error" : null}
                                placeholder="Password"
                                type="password"
                                name="password"
                                noValidate 
                                onChange={ this.onChange }
                                />
                        </div>
                        {formErrors.password.length > 0 && (
                        <span className="errorMessage">{formErrors.password}</span>)}
                        <div className="password">
                            <label htmlFor="password">Repeat password</label>
                            <input 
                                className={formErrors.repeatPassword.length > 0 ? "error" : null}
                                placeholder="Repeat password"
                                type="password"
                                name="repeatPassword"
                                noValidate 
                                onChange={ this.onChange }
                                />
                        </div>
                        {formErrors.repeatPassword.length > 0 && (<span className="errorMessage">{formErrors.repeatPassword}</span>)}
                        <div className="createAccount">
                            <button type="submit">Create Account</button>
                            <Link to="/login"><small>Already Have an Account?</small></Link>
                             
                        </div>
                    </form>
                </div>
            </div>
        );
    };
};

export {
    Register, emailRegex, formValid
}