#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
}

#[contract]
pub struct SendaContract;

#[contractimpl]
impl SendaContract {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn ping(env: Env) -> String {
        String::from_str(&env, "senda")
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn ping_returns_senda() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract_id = env.register(SendaContract, (admin.clone(),));
        let client = SendaContractClient::new(&env, &contract_id);

        assert_eq!(client.ping(), String::from_str(&env, "senda"));
        assert_eq!(client.admin(), admin);
    }
}
