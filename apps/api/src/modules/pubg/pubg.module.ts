import { Module } from "@nestjs/common";
import { PubgController } from "./pubg.controller";
import { PubgService } from "./pubg.service";

@Module({ controllers: [PubgController], providers: [PubgService] })
export class PubgModule {}
