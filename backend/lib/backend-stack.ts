import * as cdk from "aws-cdk-lib";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import {
  CfnGraphQLApi,
  CfnApiKey,
  CfnGraphQLSchema,
  CfnDataSource,
  CfnResolver,
  SchemaFile,
  MappingTemplate,
} from "aws-cdk-lib/aws-appsync";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { Role, ServicePrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";

import { readFileSync } from "fs";

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tableName = "Todo";

    // Appsync
    const todoApi = new CfnGraphQLApi(this, "TodoGraphqlApi", {
      name: "todo-graphql-api",
      authenticationType: "API_KEY",
    });
    new CfnApiKey(this, "TodosApiKey", {
      apiId: todoApi.attrApiId,
    });

    // Schema
    const apiSchema = new CfnGraphQLSchema(this, "TodoSchema", {
      apiId: todoApi.attrApiId,
      definition: SchemaFile.fromAsset("graphql/schema.graphql").definition,
    });

    // DynamoDB
    const todoTable = new Table(this, "TodoTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const todoTableRole = new Role(this, "ItemsDynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });
    todoTableRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );

    // DataSource
    const dataSource = new CfnDataSource(this, "TodosDataSource", {
      apiId: todoApi.attrApiId,
      name: "TodosDynamoDataSource",
      type: "AMAZON_DYNAMODB",
      dynamoDbConfig: {
        tableName: todoTable.tableName,
        awsRegion: this.region,
      },
      serviceRoleArn: todoTableRole.roleArn,
    });

    /**
     * Resolver
     */
    const getTodosResolver = new CfnResolver(this, "GetTodosQueryResolver", {
      apiId: todoApi.attrApiId,
      typeName: "Query",
      fieldName: "getTodos",
      dataSourceName: dataSource.name,
      requestMappingTemplate:
        MappingTemplate.dynamoDbScanTable().renderTemplate(),
      responseMappingTemplate:
        MappingTemplate.dynamoDbResultList().renderTemplate(),
    });
    getTodosResolver.addDependency(apiSchema);
  }
}
